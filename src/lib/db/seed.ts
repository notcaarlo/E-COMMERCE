import type { PGlite, Transaction } from "@electric-sql/pglite";

export const DEMO_USERS = [
  {
    id: "usr_customer_01",
    email: "cliente@demo.com",
    name: "Carlos Méndez (Cliente)",
    passwordHash: "demo123",
    role: "CUSTOMER",
  },
  {
    id: "usr_warehouse_01",
    email: "almacen@demo.com",
    name: "Elena Torres (Operadora Almacén)",
    passwordHash: "demo123",
    role: "WAREHOUSE_OPERATOR",
  },
  {
    id: "usr_support_01",
    email: "soporte@demo.com",
    name: "Sofía Ramírez (Soporte CS)",
    passwordHash: "demo123",
    role: "SUPPORT",
  },
  {
    id: "usr_admin_01",
    email: "admin@demo.com",
    name: "Alejandro Vega (Admin)",
    passwordHash: "demo123",
    role: "ADMIN",
  },
] as const;

export const DEFAULT_WAREHOUSE = {
  id: "wh_central_01",
  code: "WH-CDMX-01",
  name: "Centro de Distribución Principal",
  location: "Ciudad de México, Zona Industrial Vallejo",
};

export const INITIAL_CATALOG = [
  {
    id: "prod_mech_kb",
    slug: "teclado-mecanico-pro-75",
    name: "Chronos Key75 Wireless Mechanical Keyboard",
    description:
      "Chasis de aluminio CNC anodizado, montaje gasket, PCB hot-swap y switches táctiles pre-lubricados.",
    category: "Periféricos",
    imageUrl:
      "https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=900&q=80",
    variants: [
      {
        id: "var_kb_tactile_blk",
        sku: "CHK75-BLK-TAC",
        name: "Space Black / Switches Tactile Brown",
        attributes: { color: "Space Black", switch: "Tactile Brown" },
        priceCents: 18900,
        initialStock: 12,
      },
      {
        id: "var_kb_linear_slv",
        sku: "CHK75-SLV-LIN",
        name: "Lunar Silver / Switches Linear Red (Edición Limitada)",
        attributes: { color: "Lunar Silver", switch: "Linear Red" },
        priceCents: 19900,
        initialStock: 3, // Stock bajo ideal para probar concurrencia / anti-overselling
      },
    ],
  },
  {
    id: "prod_oled_mon",
    slug: "monitor-oled-ultrawide-34",
    name: "AetherView 34\" QD-OLED 240Hz Curved Monitor",
    description:
      "Panel QD-OLED de tercera generación, 0.03ms GtG, USB-C Power Delivery 90W y calibración Delta E < 1.",
    category: "Monitores",
    imageUrl:
      "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=80",
    variants: [
      {
        id: "var_mon_34_std",
        sku: "AV34-OLED-STD",
        name: "34\" WQHD / Base Ergonómica",
        attributes: { size: '34"', mount: "Ergonomic Stand" },
        priceCents: 84900,
        initialStock: 5,
      },
      {
        id: "var_mon_34_arm",
        sku: "AV34-OLED-PRO",
        name: "34\" WQHD + Brazo Hidráulico VESA",
        attributes: { size: '34"', mount: "VESA Hydraulic Arm" },
        priceCents: 92900,
        initialStock: 2, // Stock crítico para pruebas de última unidad
      },
    ],
  },
  {
    id: "prod_nvme_ssd",
    slug: "ssd-nvme-gen5-heatsink",
    name: "HyperFlux PCIe 5.0 NVMe M.2 SSD (14,000 MB/s)",
    description:
      "Almacenamiento de ultra-baja latencia con caché DRAM DDR4 dedicada y disipador pasivo de grafeno.",
    category: "Almacenamiento",
    imageUrl:
      "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=900&q=80",
    variants: [
      {
        id: "var_ssd_2tb",
        sku: "HFX-GEN5-2TB",
        name: "Capacidad 2TB NVMe Gen5",
        attributes: { capacity: "2TB", interface: "PCIe 5.0 x4" },
        priceCents: 24500,
        initialStock: 18,
      },
      {
        id: "var_ssd_4tb",
        sku: "HFX-GEN5-4TB",
        name: "Capacidad 4TB NVMe Gen5",
        attributes: { capacity: "4TB", interface: "PCIe 5.0 x4" },
        priceCents: 44900,
        initialStock: 4,
      },
    ],
  },
  {
    id: "prod_dock_tb5",
    slug: "thunderbolt-5-workstation-dock",
    name: "NexusDock Pro Thunderbolt 5 (120Gbps / 140W PD)",
    description:
      "Estación de acoplamiento profesional con 2.5GbE Ethernet, triple salida 8K/4K y lector CFexpress Type B.",
    category: "Conectividad",
    imageUrl:
      "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=900&q=80",
    variants: [
      {
        id: "var_dock_tb5_18p",
        sku: "NXD-TB5-18P",
        name: "18 Puertos / Chasis Titanio",
        attributes: { ports: "18-in-1", power: "140W GaN" },
        priceCents: 31900,
        initialStock: 8,
      },
    ],
  },
  {
    id: "prod_audio_dac",
    slug: "interfaz-audio-dac-studio",
    name: "Vortex Studio DAC & Balanced Headphone Amp",
    description:
      "Doble chip DAC ESS Sabre de 32 bits/768kHz, salidas XLR balanceadas y control de ganancia por relés.",
    category: "Audio Estudio",
    imageUrl:
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=900&q=80",
    variants: [
      {
        id: "var_dac_blk",
        sku: "VTX-DAC-BLK",
        name: "Edición Matte Black",
        attributes: { finish: "Matte Black", output: "4.4mm + XLR" },
        priceCents: 27500,
        initialStock: 6,
      },
    ],
  },
  {
    id: "prod_mouse_mag",
    slug: "mouse-magnesio-ultraligero-8k",
    name: "AeroBlade Mg 42g Wireless 8000Hz Mouse",
    description:
      "Exoesqueleto de aleación de magnesio de 42 gramos, sensor óptico 3950 Pro y switches ópticos sin doble clic.",
    category: "Periféricos",
    imageUrl:
      "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=900&q=80",
    variants: [
      {
        id: "var_mouse_obs",
        sku: "ABM-8K-OBS",
        name: "Obsidian Carbon + Dongle 8K",
        attributes: { color: "Obsidian Carbon", pollingRate: "8000Hz" },
        priceCents: 14900,
        initialStock: 10,
      },
      {
        id: "var_mouse_white",
        sku: "ABM-8K-WHT",
        name: "Arctic White + Dongle 8K",
        attributes: { color: "Arctic White", pollingRate: "8000Hz" },
        priceCents: 14900,
        initialStock: 1, // Solo 1 unidad disponible para probar contención inmediata
      },
    ],
  },
];

export async function seedDatabaseIfEmpty(db: PGlite | Transaction) {
  const existingUsers = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM users`
  );
  const count = parseInt(existingUsers.rows[0]?.count ?? "0", 10);
  if (count > 0) {
    return;
  }

  for (const u of DEMO_USERS) {
    await db.query(
      `INSERT INTO users (id, email, name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING`,
      [u.id, u.email, u.name, u.passwordHash, u.role]
    );
  }

  await db.query(
    `INSERT INTO warehouses (id, code, name, location, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (code) DO NOTHING`,
    [
      DEFAULT_WAREHOUSE.id,
      DEFAULT_WAREHOUSE.code,
      DEFAULT_WAREHOUSE.name,
      DEFAULT_WAREHOUSE.location,
    ]
  );

  for (const product of INITIAL_CATALOG) {
    await db.query(
      `INSERT INTO products (id, slug, name, description, category, image_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (slug) DO NOTHING`,
      [
        product.id,
        product.slug,
        product.name,
        product.description,
        product.category,
        product.imageUrl,
      ]
    );

    for (const variant of product.variants) {
      await db.query(
        `INSERT INTO product_variants (id, product_id, sku, name, attributes, price_cents)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (sku) DO NOTHING`,
        [
          variant.id,
          product.id,
          variant.sku,
          variant.name,
          JSON.stringify(variant.attributes),
          variant.priceCents,
        ]
      );

      const invId = `inv_${variant.id}`;
      await db.query(
        `INSERT INTO inventory_items (id, variant_id, warehouse_id, on_hand, available, reserved, damaged, version)
         VALUES ($1, $2, $3, $4, $4, 0, 0, 1)
         ON CONFLICT (variant_id, warehouse_id) DO NOTHING`,
        [invId, variant.id, DEFAULT_WAREHOUSE.id, variant.initialStock]
      );

      const ledgerId = `led_init_${variant.id}`;
      await db.query(
        `INSERT INTO inventory_ledger (
          id, inventory_item_id, variant_id, movement_type,
          quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
          reference_type, reference_id, actor_id, reason
        ) VALUES ($1, $2, $3, 'RESTOCK', $4, $4, $4, 0, 0, 'INITIAL_SEED', 'SEED-BATCH-001', 'usr_warehouse_01', $5)
        ON CONFLICT (id) DO NOTHING`,
        [
          ledgerId,
          invId,
          variant.id,
          variant.initialStock,
          `Carga inicial de inventario en almacén ${DEFAULT_WAREHOUSE.code}`,
        ]
      );
    }
  }
}
