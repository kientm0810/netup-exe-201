from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from secrets import token_hex
from typing import Any

from psycopg.types.json import Jsonb
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.errors import AppError
from app.db.session import get_engine

PRODUCT_CATEGORIES = {"water", "shuttlecock"}
PAYMENT_METHODS = {"cash", "bank_transfer"}


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_json_safe(item) for item in value]
    return value


def _audit(
    connection: Any,
    *,
    actor_user_id: str,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload: dict[str, Any] | None = None,
) -> None:
    connection.execute(
        text(
            """
            INSERT INTO public.audit_logs (
              actor_user_id,
              event_type,
              entity_type,
              entity_id,
              payload
            )
            VALUES (
              :actor_user_id,
              :event_type,
              :entity_type,
              :entity_id,
              :payload
            )
            """
        ),
        {
            "actor_user_id": actor_user_id,
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": Jsonb(_json_safe(payload or {})),
        },
    )


def _product_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "sku": str(row.sku),
        "name": str(row.name),
        "category": str(row.category),
        "unit": str(row.unit),
        "sale_price_vnd": int(row.sale_price_vnd),
        "stock_quantity": float(row.stock_quantity),
        "is_active": bool(row.is_active),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _invoice_item_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "item_type": str(row.item_type),
        "description": str(row.description),
        "unit": str(row.unit),
        "quantity": float(row.quantity),
        "unit_price_vnd": int(row.unit_price_vnd),
        "line_total_vnd": int(row.line_total_vnd),
    }


def _invoice_from_row(row: Any, *, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "invoice_code": str(row.invoice_code),
        "owner_name": str(row.owner_name) if row.owner_name else None,
        "customer_full_name": str(row.customer_full_name) if row.customer_full_name else None,
        "customer_email": str(row.customer_email) if row.customer_email else None,
        "status": str(row.status),
        "payment_method": str(row.payment_method),
        "subtotal_vnd": int(row.subtotal_vnd),
        "discount_vnd": int(row.discount_vnd),
        "total_vnd": int(row.total_vnd),
        "source": str(row.source),
        "note": str(row.note) if row.note else None,
        "issued_at": row.issued_at,
        "paid_at": row.paid_at,
        "items": items,
    }


def _invoice_rows(
    connection: Any,
    *,
    owner_user_id: str | None = None,
    customer_user_id: str | None = None,
    invoice_id: str | None = None,
    limit: int | None = None,
) -> list[Any]:
    where_parts: list[str] = []
    params: dict[str, Any] = {}
    if owner_user_id is not None:
        where_parts.append("invoice.owner_user_id = :owner_user_id")
        params["owner_user_id"] = owner_user_id
    if customer_user_id is not None:
        where_parts.append("invoice.customer_user_id = :customer_user_id")
        params["customer_user_id"] = customer_user_id
    if invoice_id is not None:
        where_parts.append("invoice.id = :invoice_id")
        params["invoice_id"] = invoice_id
    if not where_parts:
        raise ValueError("At least one invoice scope is required")

    where_clause = " AND ".join(where_parts)
    limit_clause = ""
    if limit is not None:
        limit_clause = "LIMIT :limit"
        params["limit"] = max(1, min(int(limit), 500))

    return connection.execute(
        text(
            f"""
            SELECT
              invoice.id,
              invoice.invoice_code,
              invoice.status,
              invoice.payment_method,
              invoice.subtotal_vnd,
              invoice.discount_vnd,
              invoice.total_vnd,
              invoice.source,
              invoice.note,
              invoice.issued_at,
              invoice.paid_at,
              owner.full_name AS owner_name,
              customer.full_name AS customer_full_name,
              customer.email AS customer_email
            FROM public.sales_invoices invoice
            JOIN public.users owner ON owner.id = invoice.owner_user_id
            LEFT JOIN public.users customer ON customer.id = invoice.customer_user_id
            WHERE {where_clause}
            ORDER BY invoice.issued_at DESC, invoice.created_at DESC
            {limit_clause}
            """
        ),
        params,
    ).all()


def _invoice_items_by_id(
    connection: Any, invoice_ids: list[str]
) -> dict[str, list[dict[str, Any]]]:
    if not invoice_ids:
        return {}
    rows = connection.execute(
        text(
            """
            SELECT
              id,
              invoice_id,
              item_type,
              description,
              unit,
              quantity,
              unit_price_vnd,
              line_total_vnd
            FROM public.sales_invoice_items
            WHERE invoice_id = ANY(:invoice_ids)
            ORDER BY created_at, id
            """
        ),
        {"invoice_ids": invoice_ids},
    ).all()
    result: dict[str, list[dict[str, Any]]] = {invoice_id: [] for invoice_id in invoice_ids}
    for row in rows:
        result.setdefault(str(row.invoice_id), []).append(_invoice_item_from_row(row))
    return result


def _invoices_for_scope(
    *,
    owner_user_id: str | None = None,
    customer_user_id: str | None = None,
    invoice_id: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    with get_engine().begin() as connection:
        rows = _invoice_rows(
            connection,
            owner_user_id=owner_user_id,
            customer_user_id=customer_user_id,
            invoice_id=invoice_id,
            limit=limit,
        )
        items_by_invoice = _invoice_items_by_id(connection, [str(row.id) for row in rows])
    return [
        _invoice_from_row(row, items=items_by_invoice.get(str(row.id), []))
        for row in rows
    ]


def list_owner_products(*, owner_user_id: str) -> list[dict[str, Any]]:
    with get_engine().begin() as connection:
        rows = connection.execute(
            text(
                """
                SELECT
                  id,
                  sku,
                  name,
                  category,
                  unit,
                  sale_price_vnd,
                  stock_quantity,
                  is_active,
                  created_at,
                  updated_at
                FROM public.owner_products
                WHERE owner_user_id = :owner_user_id
                ORDER BY is_active DESC, category, name, sku
                """
            ),
            {"owner_user_id": owner_user_id},
        ).all()
    return [_product_from_row(row) for row in rows]


def create_owner_product(*, owner_user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    sku = str(data.get("sku") or "").strip().upper()
    name = str(data.get("name") or "").strip()
    category = str(data.get("category") or "").strip().lower()
    unit = str(data.get("unit") or "").strip().lower()
    sale_price_vnd = int(data.get("sale_price_vnd") or 0)
    stock_quantity = int(data.get("stock_quantity") or 0)

    if not sku or not name or not unit:
        raise AppError(
            status_code=422,
            code="owner_product_invalid",
            message="Mã hàng, tên hàng và đơn vị tính là bắt buộc",
        )
    if category not in PRODUCT_CATEGORIES:
        raise AppError(
            status_code=422,
            code="owner_product_category_invalid",
            message="Chỉ hỗ trợ sản phẩm nước uống hoặc cầu lông",
        )
    if sale_price_vnd < 0 or stock_quantity < 0:
        raise AppError(
            status_code=422,
            code="owner_product_value_invalid",
            message="Giá bán và tồn kho không được âm",
        )

    try:
        with get_engine().begin() as connection:
            row = connection.execute(
                text(
                    """
                    INSERT INTO public.owner_products (
                      owner_user_id,
                      sku,
                      name,
                      category,
                      unit,
                      sale_price_vnd,
                      stock_quantity
                    )
                    VALUES (
                      :owner_user_id,
                      :sku,
                      :name,
                      :category,
                      :unit,
                      :sale_price_vnd,
                      :stock_quantity
                    )
                    RETURNING
                      id,
                      sku,
                      name,
                      category,
                      unit,
                      sale_price_vnd,
                      stock_quantity,
                      is_active,
                      created_at,
                      updated_at
                    """
                ),
                {
                    "owner_user_id": owner_user_id,
                    "sku": sku,
                    "name": name,
                    "category": category,
                    "unit": unit,
                    "sale_price_vnd": sale_price_vnd,
                    "stock_quantity": stock_quantity,
                },
            ).one()
            if stock_quantity:
                connection.execute(
                    text(
                        """
                        INSERT INTO public.inventory_movements (
                          product_id,
                          movement_type,
                          quantity_delta,
                          note,
                          created_by_user_id
                        )
                        VALUES (
                          :product_id,
                          'restock',
                          :quantity_delta,
                          'Tồn kho ban đầu',
                          :owner_user_id
                        )
                        """
                    ),
                    {
                        "product_id": str(row.id),
                        "quantity_delta": stock_quantity,
                        "owner_user_id": owner_user_id,
                    },
                )
            _audit(
                connection,
                actor_user_id=owner_user_id,
                event_type="owner_product_created",
                entity_type="owner_product",
                entity_id=str(row.id),
                payload={"sku": sku, "category": category, "stock_quantity": stock_quantity},
            )
    except IntegrityError as exc:
        raise AppError(
            status_code=409,
            code="owner_product_sku_exists",
            message="Mã sản phẩm đã tồn tại trong danh mục của bạn",
        ) from exc

    return _product_from_row(row)


def restock_owner_product(
    *, owner_user_id: str, product_id: str, quantity: int, note: str | None = None
) -> dict[str, Any]:
    if quantity <= 0:
        raise AppError(
            status_code=422,
            code="owner_product_restock_invalid",
            message="Số lượng nhập kho phải lớn hơn 0",
        )

    with get_engine().begin() as connection:
        row = connection.execute(
            text(
                """
                UPDATE public.owner_products
                SET stock_quantity = stock_quantity + :quantity
                WHERE id = :product_id AND owner_user_id = :owner_user_id
                RETURNING
                  id,
                  sku,
                  name,
                  category,
                  unit,
                  sale_price_vnd,
                  stock_quantity,
                  is_active,
                  created_at,
                  updated_at
                """
            ),
            {
                "product_id": product_id,
                "owner_user_id": owner_user_id,
                "quantity": quantity,
            },
        ).first()
        if row is None:
            raise AppError(
                status_code=404,
                code="owner_product_not_found",
                message="Không tìm thấy sản phẩm thuộc tài khoản chủ sân này",
            )
        connection.execute(
            text(
                """
                INSERT INTO public.inventory_movements (
                  product_id,
                  movement_type,
                  quantity_delta,
                  note,
                  created_by_user_id
                )
                VALUES (
                  :product_id,
                  'restock',
                  :quantity,
                  :note,
                  :owner_user_id
                )
                """
            ),
            {
                "product_id": product_id,
                "quantity": quantity,
                "note": note or "Nhập thêm tại quầy",
                "owner_user_id": owner_user_id,
            },
        )
        _audit(
            connection,
            actor_user_id=owner_user_id,
            event_type="owner_product_restocked",
            entity_type="owner_product",
            entity_id=product_id,
            payload={"quantity": quantity, "stock_quantity": float(row.stock_quantity)},
        )
    return _product_from_row(row)


def list_owner_invoices(*, owner_user_id: str, limit: int = 200) -> list[dict[str, Any]]:
    return _invoices_for_scope(owner_user_id=owner_user_id, limit=limit)


def get_owner_invoice(*, owner_user_id: str, invoice_id: str) -> dict[str, Any]:
    rows = _invoices_for_scope(owner_user_id=owner_user_id, invoice_id=invoice_id)
    if not rows:
        raise AppError(
            status_code=404,
            code="owner_invoice_not_found",
            message="Không tìm thấy hóa đơn thuộc tài khoản chủ sân này",
        )
    return rows[0]


def _customer_for_email(connection: Any, customer_email: str | None) -> dict[str, str] | None:
    if not customer_email:
        return None
    clean_email = customer_email.strip().lower()
    if "@" not in clean_email:
        raise AppError(
            status_code=422,
            code="invoice_customer_email_invalid",
            message="Email khách hàng không hợp lệ",
        )
    row = connection.execute(
        text(
            """
            SELECT id, email, full_name
            FROM public.users
            WHERE email = :email AND is_active = true
            LIMIT 1
            """
        ),
        {"email": clean_email},
    ).first()
    if row is None:
        raise AppError(
            status_code=404,
            code="invoice_customer_not_found",
            message="Không tìm thấy tài khoản NetUp đang hoạt động với email này",
        )
    return {"id": str(row.id), "email": str(row.email), "full_name": str(row.full_name)}


def _new_invoice_code() -> str:
    return f"POS-{datetime.now().strftime('%Y%m%d')}-{token_hex(3).upper()}"


def create_owner_invoice(*, owner_user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    rental_amount_vnd = int(data.get("rental_amount_vnd") or 0)
    payment_method = str(data.get("payment_method") or "cash")
    note = str(data.get("note") or "").strip() or None
    requested_items = list(data.get("items") or [])

    if rental_amount_vnd < 0:
        raise AppError(
            status_code=422,
            code="invoice_rental_amount_invalid",
            message="Tiền thuê sân không được âm",
        )
    if payment_method not in PAYMENT_METHODS:
        raise AppError(
            status_code=422,
            code="invoice_payment_method_invalid",
            message="Phương thức thanh toán không hợp lệ",
        )

    quantities: dict[str, int] = {}
    for requested in requested_items:
        product_id = str(requested.get("product_id") or "").strip()
        quantity = int(requested.get("quantity") or 0)
        if not product_id or quantity <= 0:
            raise AppError(
                status_code=422,
                code="invoice_item_invalid",
                message="Mỗi sản phẩm phải có mã và số lượng lớn hơn 0",
            )
        if product_id in quantities:
            raise AppError(
                status_code=422,
                code="invoice_item_duplicate",
                message="Một sản phẩm chỉ được xuất hiện một lần trong hóa đơn",
            )
        quantities[product_id] = quantity

    if rental_amount_vnd == 0 and not quantities:
        raise AppError(
            status_code=422,
            code="invoice_empty",
            message="Hóa đơn cần có tiền thuê sân hoặc ít nhất một sản phẩm",
        )

    with get_engine().begin() as connection:
        customer = _customer_for_email(connection, data.get("customer_email"))
        products_by_id: dict[str, Any] = {}
        if quantities:
            product_rows = connection.execute(
                text(
                    """
                    SELECT
                      id,
                      sku,
                      name,
                      category,
                      unit,
                      sale_price_vnd,
                      stock_quantity,
                      is_active
                    FROM public.owner_products
                    WHERE owner_user_id = :owner_user_id
                      AND id = ANY(:product_ids)
                    FOR UPDATE
                    """
                ),
                {"owner_user_id": owner_user_id, "product_ids": list(quantities)},
            ).all()
            products_by_id = {str(row.id): row for row in product_rows}
            missing_ids = sorted(set(quantities) - set(products_by_id))
            if missing_ids:
                raise AppError(
                    status_code=404,
                    code="invoice_product_not_found",
                    message="Một hoặc nhiều sản phẩm không thuộc danh mục của bạn",
                )

        invoice_lines: list[dict[str, Any]] = []
        if rental_amount_vnd:
            invoice_lines.append(
                {
                    "product_id": None,
                    "item_type": "court_rental",
                    "description": "Thuê sân cầu lông",
                    "unit": "lượt",
                    "quantity": 1,
                    "unit_price_vnd": rental_amount_vnd,
                    "line_total_vnd": rental_amount_vnd,
                }
            )

        for product_id, quantity in quantities.items():
            product = products_by_id[product_id]
            if not product.is_active:
                raise AppError(
                    status_code=409,
                    code="invoice_product_inactive",
                    message=f"Sản phẩm {product.name} đang tạm ngưng bán",
                )
            if Decimal(product.stock_quantity) < quantity:
                raise AppError(
                    status_code=409,
                    code="invoice_product_out_of_stock",
                    message=f"Sản phẩm {product.name} không đủ tồn kho",
                )
            invoice_lines.append(
                {
                    "product_id": product_id,
                    "item_type": str(product.category),
                    "description": str(product.name),
                    "unit": str(product.unit),
                    "quantity": quantity,
                    "unit_price_vnd": int(product.sale_price_vnd),
                    "line_total_vnd": int(product.sale_price_vnd) * quantity,
                }
            )

        subtotal_vnd = sum(int(item["line_total_vnd"]) for item in invoice_lines)
        invoice_code = _new_invoice_code()
        try:
            invoice = connection.execute(
                text(
                    """
                    INSERT INTO public.sales_invoices (
                      invoice_code,
                      owner_user_id,
                      customer_user_id,
                      status,
                      payment_method,
                      subtotal_vnd,
                      discount_vnd,
                      total_vnd,
                      source,
                      note,
                      issued_at,
                      paid_at
                    )
                    VALUES (
                      :invoice_code,
                      :owner_user_id,
                      :customer_user_id,
                      'paid',
                      :payment_method,
                      :subtotal_vnd,
                      0,
                      :total_vnd,
                      'owner',
                      :note,
                      now(),
                      now()
                    )
                    RETURNING id
                    """
                ),
                {
                    "invoice_code": invoice_code,
                    "owner_user_id": owner_user_id,
                    "customer_user_id": customer["id"] if customer else None,
                    "payment_method": payment_method,
                    "subtotal_vnd": subtotal_vnd,
                    "total_vnd": subtotal_vnd,
                    "note": note,
                },
            ).one()
        except IntegrityError:
            # A random code collision is extremely rare. Return a clear retryable error
            # rather than risking a duplicate receipt.
            raise AppError(
                status_code=409,
                code="invoice_code_conflict",
                message="Không thể tạo mã hóa đơn, vui lòng thử lại",
            ) from None

        for item in invoice_lines:
            invoice_item = connection.execute(
                text(
                    """
                    INSERT INTO public.sales_invoice_items (
                      invoice_id,
                      product_id,
                      item_type,
                      description,
                      unit,
                      quantity,
                      unit_price_vnd,
                      line_total_vnd
                    )
                    VALUES (
                      :invoice_id,
                      :product_id,
                      :item_type,
                      :description,
                      :unit,
                      :quantity,
                      :unit_price_vnd,
                      :line_total_vnd
                    )
                    RETURNING id
                    """
                ),
                {"invoice_id": str(invoice.id), **item},
            ).one()
            if item["product_id"] is not None:
                connection.execute(
                    text(
                        """
                        UPDATE public.owner_products
                        SET stock_quantity = stock_quantity - :quantity
                        WHERE id = :product_id AND owner_user_id = :owner_user_id
                        """
                    ),
                    {
                        "product_id": item["product_id"],
                        "owner_user_id": owner_user_id,
                        "quantity": item["quantity"],
                    },
                )
                connection.execute(
                    text(
                        """
                        INSERT INTO public.inventory_movements (
                          product_id,
                          invoice_item_id,
                          movement_type,
                          quantity_delta,
                          note,
                          created_by_user_id
                        )
                        VALUES (
                          :product_id,
                          :invoice_item_id,
                          'sale',
                          :quantity_delta,
                          :note,
                          :owner_user_id
                        )
                        """
                    ),
                    {
                        "product_id": item["product_id"],
                        "invoice_item_id": str(invoice_item.id),
                        "quantity_delta": -item["quantity"],
                        "note": f"Bán theo hóa đơn {invoice_code}",
                        "owner_user_id": owner_user_id,
                    },
                )
        _audit(
            connection,
            actor_user_id=owner_user_id,
            event_type="owner_invoice_created",
            entity_type="sales_invoice",
            entity_id=str(invoice.id),
            payload={
                "invoice_code": invoice_code,
                "customer_user_id": customer["id"] if customer else None,
                "total_vnd": subtotal_vnd,
                "item_count": len(invoice_lines),
            },
        )

    return get_owner_invoice(owner_user_id=owner_user_id, invoice_id=str(invoice.id))


def get_owner_commerce_dashboard(*, owner_user_id: str, period_days: int = 30) -> dict[str, Any]:
    period_days = max(7, min(int(period_days), 90))
    with get_engine().begin() as connection:
        summary = connection.execute(
            text(
                """
                WITH paid_invoices AS (
                  SELECT id, total_vnd
                  FROM public.sales_invoices
                  WHERE owner_user_id = :owner_user_id
                    AND status = 'paid'
                ), paid_lines AS (
                  SELECT item.item_type, item.line_total_vnd
                  FROM public.sales_invoice_items item
                  JOIN paid_invoices invoice ON invoice.id = item.invoice_id
                )
                SELECT
                  COALESCE((SELECT sum(total_vnd) FROM paid_invoices), 0)::bigint
                    AS total_revenue_vnd,
                  COALESCE(
                    (SELECT sum(line_total_vnd) FROM paid_lines WHERE item_type = 'court_rental'),
                    0
                  )::bigint AS court_revenue_vnd,
                  COALESCE(
                    (SELECT sum(line_total_vnd) FROM paid_lines WHERE item_type = 'water'),
                    0
                  )::bigint AS water_revenue_vnd,
                  COALESCE(
                    (SELECT sum(line_total_vnd) FROM paid_lines WHERE item_type = 'shuttlecock'),
                    0
                  )::bigint AS shuttlecock_revenue_vnd,
                  (SELECT count(*)::int FROM paid_invoices) AS paid_invoice_count,
                  (
                    SELECT count(*)::int
                    FROM public.sales_invoices
                    WHERE owner_user_id = :owner_user_id
                      AND status = 'draft'
                  ) AS pending_invoice_count
                """
            ),
            {"owner_user_id": owner_user_id},
        ).one()
        daily_rows = connection.execute(
            text(
                """
                WITH days AS (
                  SELECT generate_series(
                    (now() AT TIME ZONE 'Asia/Bangkok')::date - (:period_days - 1),
                    (now() AT TIME ZONE 'Asia/Bangkok')::date,
                    interval '1 day'
                  )::date AS sale_date
                ), paid_invoices AS (
                  SELECT
                    id,
                    (issued_at AT TIME ZONE 'Asia/Bangkok')::date AS sale_date,
                    total_vnd
                  FROM public.sales_invoices
                  WHERE owner_user_id = :owner_user_id
                    AND status = 'paid'
                    AND issued_at >= (
                      (now() AT TIME ZONE 'Asia/Bangkok')::date - (:period_days - 1)
                    )::timestamp AT TIME ZONE 'Asia/Bangkok'
                ), totals AS (
                  SELECT sale_date, sum(total_vnd)::bigint AS total_revenue_vnd
                  FROM paid_invoices
                  GROUP BY sale_date
                ), lines AS (
                  SELECT
                    invoice.sale_date,
                    COALESCE(
                      sum(item.line_total_vnd) FILTER (WHERE item.item_type = 'court_rental'),
                      0
                    )::bigint AS court_revenue_vnd,
                    COALESCE(
                      sum(item.line_total_vnd) FILTER (WHERE item.item_type = 'water'),
                      0
                    )::bigint AS water_revenue_vnd,
                    COALESCE(
                      sum(item.line_total_vnd) FILTER (WHERE item.item_type = 'shuttlecock'),
                      0
                    )::bigint AS shuttlecock_revenue_vnd
                  FROM paid_invoices invoice
                  JOIN public.sales_invoice_items item ON item.invoice_id = invoice.id
                  GROUP BY invoice.sale_date
                )
                SELECT
                  days.sale_date,
                  COALESCE(totals.total_revenue_vnd, 0)::bigint AS total_revenue_vnd,
                  COALESCE(lines.court_revenue_vnd, 0)::bigint AS court_revenue_vnd,
                  COALESCE(lines.water_revenue_vnd, 0)::bigint AS water_revenue_vnd,
                  COALESCE(lines.shuttlecock_revenue_vnd, 0)::bigint AS shuttlecock_revenue_vnd
                FROM days
                LEFT JOIN totals ON totals.sale_date = days.sale_date
                LEFT JOIN lines ON lines.sale_date = days.sale_date
                ORDER BY days.sale_date
                """
            ),
            {"owner_user_id": owner_user_id, "period_days": period_days},
        ).all()

    return {
        "total_revenue_vnd": int(summary.total_revenue_vnd),
        "court_revenue_vnd": int(summary.court_revenue_vnd),
        "water_revenue_vnd": int(summary.water_revenue_vnd),
        "shuttlecock_revenue_vnd": int(summary.shuttlecock_revenue_vnd),
        "paid_invoice_count": int(summary.paid_invoice_count),
        "pending_invoice_count": int(summary.pending_invoice_count),
        "daily": [
            {
                "date": row.sale_date,
                "total_revenue_vnd": int(row.total_revenue_vnd),
                "court_revenue_vnd": int(row.court_revenue_vnd),
                "water_revenue_vnd": int(row.water_revenue_vnd),
                "shuttlecock_revenue_vnd": int(row.shuttlecock_revenue_vnd),
            }
            for row in daily_rows
        ],
        "recent_invoices": list_owner_invoices(owner_user_id=owner_user_id, limit=8),
    }


def list_player_bills(*, player_user_id: str, limit: int = 200) -> list[dict[str, Any]]:
    return _invoices_for_scope(customer_user_id=player_user_id, limit=limit)


def get_player_bill(*, player_user_id: str, invoice_id: str) -> dict[str, Any]:
    rows = _invoices_for_scope(customer_user_id=player_user_id, invoice_id=invoice_id)
    if not rows:
        raise AppError(
            status_code=404,
            code="player_bill_not_found",
            message="Không tìm thấy hóa đơn thuộc tài khoản của bạn",
        )
    return rows[0]
