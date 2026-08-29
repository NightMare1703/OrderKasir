import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Category from '../../database/models/category';
import Customer from '../../database/models/customer';
import Payment from '../../database/models/payment';
import Product from '../../database/models/product';
import Setting from '../../database/models/setting';
import StockMovement from '../../database/models/stock-movement';
import Transaction from '../../database/models/transaction';
import TransactionItem from '../../database/models/transaction-item';
import User from '../../database/models/user';
import { appDatabaseSchema } from '../../database/schema';
import { CustomerService } from '../CustomerService';

logger.silence();

const makeDb = () => {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions: { autosave: false },
  });
  return new Database({
    adapter,
    modelClasses: [
      Category,
      Customer,
      Payment,
      Product,
      Setting,
      StockMovement,
      Transaction,
      TransactionItem,
      User,
    ],
  });
};

type TestHarness = {
  db: Database;
  service: CustomerService;
  now: () => number;
};

const FIXED_NOW = new Date(2026, 7, 27, 14, 5, 0).getTime();

const makeHarness = (): TestHarness => {
  const db = makeDb();
  let currentTime = FIXED_NOW;
  const service = new CustomerService(db, { now: () => currentTime });
  return { db, service, now: () => currentTime };
};

describe('CustomerService (T1.10)', () => {
  it('membuat pelanggan dengan nama wajib', async () => {
    const { service } = makeHarness();

    const customer = await service.createCustomer({
      name: 'Budi Santoso',
      phone: '081234567890',
      note: 'Langganan',
      debtLimit: 500_000,
    });

    expect(customer.name).toBe('Budi Santoso');
    expect(customer.phone).toBe('081234567890');
    expect(customer.note).toBe('Langganan');
    expect(customer.debtLimit).toBe(500_000);
    expect(customer._getRaw('deleted')).toBe(false);
  });

  it('membuat pelanggan tanpa field opsional', async () => {
    const { service } = makeHarness();

    const customer = await service.createCustomer({
      name: 'Sari',
    });

    expect(customer.name).toBe('Sari');
    expect(customer.phone).toBeNull();
    expect(customer.note).toBeNull();
    expect(customer.debtLimit).toBeNull();
  });

  it('menolak nama kosong', async () => {
    const { service } = makeHarness();

    await expect(
      service.createCustomer({ name: '   ' })
    ).rejects.toThrow('Nama pelanggan tidak valid');
  });

  it('menolak nama terlalu panjang', async () => {
    const { service } = makeHarness();

    await expect(
      service.createCustomer({ name: 'a'.repeat(101) })
    ).rejects.toThrow('Nama pelanggan tidak valid');
  });

  it('menormalkan phone dan note (trim)', async () => {
    const { service } = makeHarness();

    const customer = await service.createCustomer({
      name: 'Test',
      phone: '  081234567890  ',
      note: '  catatan  ',
    });

    expect(customer.phone).toBe('081234567890');
    expect(customer.note).toBe('catatan');
  });

  it('menolak phone terlalu panjang', async () => {
    const { service } = makeHarness();

    await expect(
      service.createCustomer({ name: 'Test', phone: '0'.repeat(21) })
    ).rejects.toThrow('Nomor HP tidak valid');
  });

  it('menolak debtLimit negatif', async () => {
    const { service } = makeHarness();

    await expect(
      service.createCustomer({ name: 'Test', debtLimit: -1000 })
    ).rejects.toThrow('Plafon bon tidak valid');
  });

  it('mencari pelanggan by id', async () => {
    const { service } = makeHarness();
    const created = await service.createCustomer({ name: 'Budi' });

    const found = await service.findCustomer(created.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Budi');
  });

  it('mengembalikan null untuk id tidak ada', async () => {
    const { service } = makeHarness();

    const found = await service.findCustomer('tidak-ada');
    expect(found).toBeNull();
  });

  it('mencari pelanggan dengan search nama', async () => {
    const { service } = makeHarness();
    await service.createCustomer({ name: 'Budi Santoso' });
    await service.createCustomer({ name: 'Sari Dewi' });
    await service.createCustomer({ name: 'Budi Hartono' });

    const results = await service.listCustomers('budi');
    expect(results).toHaveLength(2);
    expect(results.every((c) => c.name.toLowerCase().includes('budi'))).toBe(true);
  });

  it('mengembalikan semua pelanggan tanpa search', async () => {
    const { service } = makeHarness();
    await service.createCustomer({ name: 'Budi' });
    await service.createCustomer({ name: 'Sari' });

    const results = await service.listCustomers();
    expect(results).toHaveLength(2);
  });

  it('mengupdate pelanggan', async () => {
    const { service } = makeHarness();
    const created = await service.createCustomer({ name: 'Budi', phone: '081234567890' });

    const updated = await service.updateCustomer(created.id, {
      name: 'Budi Santoso',
      phone: '081298765432',
      debtLimit: 1_000_000,
    });

    expect(updated?.name).toBe('Budi Santoso');
    expect(updated?.phone).toBe('081298765432');
    expect(updated?.debtLimit).toBe(1_000_000);
  });

  it('soft delete pelanggan', async () => {
    const { service, db } = makeHarness();
    const created = await service.createCustomer({ name: 'Budi' });

    const deleted = await service.softDeleteCustomer(created.id);
    expect(deleted).toBe(true);

    const found = await service.findCustomer(created.id);
    expect(found).toBeNull();

    // Verify deleted flag in DB
    const raw = await db.get<Customer>('customers').find(created.id);
    expect(raw._getRaw('deleted')).toBe(true);
  });
});