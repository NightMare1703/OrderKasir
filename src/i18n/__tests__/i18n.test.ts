import i18n, { DEFAULT_LANGUAGE, changeAppLanguage } from '../index';

describe('i18n', () => {
  it('ter-inisialisasi dengan bahasa default Indonesia', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
  });

  it('menampilkan key contoh common.ok', () => {
    expect(i18n.t('common.ok')).toBe('OK');
    expect(i18n.t('common.cancel')).toBe('Batal');
  });

  it('bisa ganti bahasa ke en dan kembali ke id', async () => {
    await changeAppLanguage('en');
    expect(i18n.t('common.cancel')).toBe('Cancel');

    await changeAppLanguage('id');
    expect(i18n.t('common.cancel')).toBe('Batal');
  });

  it('fallback ke default bila bahasa tidak dikenal', async () => {
    await changeAppLanguage('xx');
    expect(['id']).toContain(i18n.language);
  });
});
