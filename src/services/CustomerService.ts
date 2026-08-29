import { Database, Q } from '@nozbe/watermelondb';

import Customer from '../database/models/customer';

export type CustomerInput = {
  name: string;
  phone?: string | null;
  note?: string | null;
  debtLimit?: number | null;
};

export type CustomerServiceOptions = {
  now?: () => number;
};

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const isValidName = (name: string): boolean => {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 100;
};

const isValidPhone = (phone: string | null | undefined): boolean => {
  if (!phone) return true;
  const trimmed = phone.trim();
  return trimmed.length <= 20;
};

const isValidDebtLimit = (limit: number | null | undefined): boolean => {
  if (limit === null || limit === undefined) return true;
  return Number.isInteger(limit) && limit >= 0;
};

export class CustomerService {
  private readonly database: Database;
  private readonly now: () => number;

  constructor(database: Database, options: CustomerServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
  }

  async createCustomer(input: CustomerInput): Promise<Customer> {
    const name = input.name.trim();
    if (!isValidName(name)) {
      throw new Error('Nama pelanggan tidak valid');
    }
    const phone = normalizeOptionalText(input.phone);
    if (phone !== null && !isValidPhone(phone)) {
      throw new Error('Nomor HP tidak valid');
    }
    if (!isValidDebtLimit(input.debtLimit)) {
      throw new Error('Plafon bon tidak valid');
    }
    const note = normalizeOptionalText(input.note);

    const timestamp = this.now();
    let created: Customer | undefined;
    await this.database.write(async () => {
      created = await this.database.get<Customer>('customers').create((raw) => {
        raw.name = name;
        raw.phone = phone;
        raw.note = note;
        raw.debtLimit = input.debtLimit ?? null;
        raw.createdAt = timestamp;
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', timestamp);
      });
    });
    if (!created) throw new Error('Gagal membuat pelanggan');
    return created;
  }

  async listCustomers(search?: string): Promise<Customer[]> {
    let query = this.database.get<Customer>('customers').query(
      Q.where('deleted', false),
      Q.sortBy('name', Q.asc),
    );
    if (search && search.trim() !== '') {
      const term = search.trim().toLowerCase();
      query = query.extend(
        Q.where('name', Q.like(`%${term}%`)),
      );
    }
    return query.fetch();
  }

  async findCustomer(id: string): Promise<Customer | null> {
    try {
      const customer = await this.database.get<Customer>('customers').find(id);
      return customer._getRaw('deleted') ? null : customer;
    } catch {
      return null;
    }
  }

  async updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer | null> {
    const customer = await this.findCustomer(id);
    if (!customer) return null;

    const name = input.name !== undefined ? input.name.trim() : customer.name;
    if (!isValidName(name)) {
      throw new Error('Nama pelanggan tidak valid');
    }
    const phone = input.phone !== undefined ? normalizeOptionalText(input.phone) : customer.phone;
    if (phone !== null && !isValidPhone(phone)) {
      throw new Error('Nomor HP tidak valid');
    }
    if (input.debtLimit !== undefined && !isValidDebtLimit(input.debtLimit)) {
      throw new Error('Plafon bon tidak valid');
    }
    const note = input.note !== undefined ? normalizeOptionalText(input.note) : customer.note;

    const timestamp = this.now();
    await this.database.write(async () => {
      await customer.update((raw) => {
        raw.name = name;
        raw.phone = phone;
        raw.note = note;
        raw.debtLimit = input.debtLimit ?? customer.debtLimit;
        raw.updatedAt = timestamp;
        raw._setRaw('last_modified', timestamp);
      });
    });
    return customer;
  }

  async softDeleteCustomer(id: string): Promise<boolean> {
    const customer = await this.findCustomer(id);
    if (!customer) return false;
    const timestamp = this.now();
    await this.database.write(async () => {
      await customer.update((raw) => {
        raw._setRaw('deleted', true);
        raw.updatedAt = timestamp;
        raw._setRaw('last_modified', timestamp);
      });
    });
    return true;
  }
}