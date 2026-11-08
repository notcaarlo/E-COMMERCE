# StockGuard E-Commerce — High-Concurrency Inventory & Order State Machine Engine

Proyecto Full-Stack de portafolio enfocado en la **gestión estricta de inventarios con garantías ACID en PostgreSQL**, **control de concurrencia anti-sobreventa (`SELECT ... FOR UPDATE`)**, **trazabilidad contable mediante Kardex inmutable (Inventory Ledger)**, **máquina de estados de pedidos determinística** y **control de acceso basado en roles (RBAC)**.

---

## Tecnologías Principales

- **Frontend & Full-Stack Framework:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons.
- **Base de Datos Relacional (Zero-Cost / Dual Mode):**
  - **PostgreSQL Real Embebido (`@electric-sql/pglite`):** Ejecuta PostgreSQL real compilado en WebAssembly sin requerir servidores pagos ni configuración externa (ideal para desplegar o evaluar gratis al instante).
  - **Esquema Prisma ORM (`prisma/schema.prisma`) + `docker-compose.yml`:** Esquema declarativo completo listo para conectarse a cualquier servidor PostgreSQL 16 tradicional.
- **Testing Automatizado:** Vitest (pruebas de concurrencia con 20 compradores simultáneos compitiendo por las últimas 3 unidades, idempotencia, expiración perezosa de TTL y resolución de webhooks tardíos).

---

## Características de Ingeniería Destacadas

### 1. Ecuación Contable e Integridad en Base de Datos (`CHECK Constraints`)
Cada variante (`ProductVariant` / SKU) mantiene saldos consolidados en `inventory_items` protegidos directamente por restricciones de PostgreSQL:
```sql
CONSTRAINT chk_inventory_non_negative CHECK (
  on_hand >= 0 AND available >= 0 AND reserved >= 0 AND damaged >= 0
),
CONSTRAINT chk_inventory_balance_equation CHECK (
  on_hand = available + reserved
)
```
- **`on_hand`**: Stock físico total apto dentro del almacén.
- **`available`**: Stock libre para nuevas compras (`on_hand - reserved`).
- **`reserved`**: Stock retenido temporalmente por órdenes en `PENDING_PAYMENT` (con TTL) o en preparación (`PAID` / `PROCESSING`).
- **`damaged`**: Stock en cuarentena o merma (producto de devoluciones defectuosas o bajas de almacén).

### 2. Libro Mayor Inmutable (`inventory_ledger` / Kardex)
Ningún saldo de `inventory_items` se modifica sin insertar en la misma transacción ACID un registro *append-only* en `inventory_ledger`:
- Tipos de movimiento: `RESTOCK`, `RESERVE`, `RELEASE_EXPIRED`, `RELEASE_CANCELLED`, `COMMIT_SALE`, `RETURN_TO_AVAILABLE`, `RETURN_TO_DAMAGED`, `MANUAL_ADJUSTMENT`.
- Registra el `quantity_delta`, la fotografía exacta de los 4 saldos posteriores al movimiento (`on_hand_after`, `available_after`, `reserved_after`, `damaged_after`), la referencia (`ORDER`, `RETURN`, `MANUAL_OP`), el usuario actor y el motivo obligatorio.

### 3. Control de Concurrencia en Checkout y Prevención de Deadlocks
1. **Idempotencia:** Cada intento de checkout exige un `idempotency_key` único para evitar cargos o reservas duplicadas ante reintentos de red.
2. **Ordenamiento Determinístico de Locks:** Si un carrito contiene múltiples SKUs, los `variant_id` se ordenan lexicográficamente antes de ejecutar `SELECT ... FOR UPDATE`, eliminando cualquier condición de *deadlock* circular entre transacciones concurrentes.
3. **Liberación Perezosa (*Lazy Release*) + Worker `SKIP LOCKED`:**
   - Si un comprador solicita un SKU cuyas unidades están retenidas por reservas cuyo TTL (15 min) ya expiró pero aún no han sido barridas por el cron, la misma transacción de checkout libera las reservas caducadas y reclama el stock atómicamente.
   - Adicionalmente, un worker (`POST /api/cron/expire-reservations`) barre periódicamente las reservas vencidas usando `SELECT ... FOR UPDATE SKIP LOCKED`.

### 4. Resolución de la Condición de Carrera de Webhooks Tardíos (*Late Payment Webhook*)
¿Qué ocurre si el webhook `payment_intent.succeeded` de la pasarela llega milisegundos **después** de que el TTL de 15 minutos expiró y el stock fue liberado (`EXPIRED`)?
1. El procesador de webhooks bloquea las filas de inventario (`SELECT ... FOR UPDATE`).
2. **Si aún existe stock libre (`available >= qty`):** Reactiva automáticamente el pedido (`EXPIRED -> PAID`), vuelve a reservar el stock y registra la reactivación en el Kardex.
3. **Si otro cliente compró la última unidad (`available < qty`):** Evita la sobreventa (*zero overselling*), transiciona el pedido a `REFUND_PENDING` y genera una alerta prioritaria para que Soporte ejecute el reembolso.

### 5. Máquina de Estados del Pedido y Separación de Roles (RBAC)

| Rol | Credenciales Demo | Permisos Principales |
| :--- | :--- | :--- |
| **Cliente (`CUSTOMER`)** | `cliente@demo.com` / `demo123` | Compra en tienda con reserva TTL, cancela por sí mismo **solo** en `PENDING_PAYMENT` o `PAID` (se bloquea al pasar a `PROCESSING`), y solicita devolución en `DELIVERED`. |
| **Operador de Almacén (`WAREHOUSE_OPERATOR`)** | `almacen@demo.com` / `demo123` | Ejecuta Picking (`PAID -> PROCESSING`), Despacho físico (`PROCESSING -> SHIPPED` descontando `on_hand`), **Inspección de Devoluciones** (`RETURN_REQUESTED -> RETURNED` decidiendo cuántas unidades van a `available` vs `damaged`), y ajustes manuales con motivo obligatorio. |
| **Soporte (`SUPPORT`)** | `soporte@demo.com` / `demo123` | Gestiona alertas de pagos tardíos, ejecuta reembolsos (`REFUND_PENDING -> REFUNDED`) y cancelaciones asistidas en `PROCESSING`. **Restringido:** No puede modificar saldos físicos de inventario. |
| **Administrador (`ADMIN`)** | `admin@demo.com` / `demo123` | Acceso completo al catálogo, almacén, Kardex, máquina de estados y utilidades de mantenimiento. |

---

## Cómo Ejecutar el Proyecto Localmente

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar la suite de pruebas de concurrencia y máquina de estados (Vitest)
npm test

# 3. Iniciar el servidor de desarrollo (PostgreSQL embebido con auto-seed)
npm run dev
```

Abre `http://localhost:3000` en tu navegador:
- **Tienda Cliente:** `http://localhost:3000/` y `http://localhost:3000/orders`
- **Selector de Roles / Login:** `http://localhost:3000/login`
- **Dashboard Backoffice (Almacén / Soporte / Admin):** `http://localhost:3000/admin`
