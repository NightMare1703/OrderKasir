import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { database } from '../../../database';
import type User from '../../../database/models/user';
import { ReportService } from '../../../services/ReportService';
import { ShiftService } from '../../../services/ShiftService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import {
  buildDailyTrendCsv,
  buildDebtAgingCsv,
  buildInventoryCsv,
  buildPaymentBreakdownCsv,
  buildProfitSummaryCsv,
  buildSalesSummaryCsv,
  buildShiftCsv,
  buildTopProductsCsv,
  csvFileName,
} from '../../../utils/reportCsv';
import { shareCsv } from '../../../utils/share';

type PeriodPreset = 'today' | 'yesterday' | '7days' | 'month';

const PERIOD_KEYS: Record<PeriodPreset, string> = {
  today: 'reports.periodToday',
  yesterday: 'reports.periodYesterday',
  '7days': 'reports.period7Days',
  month: 'reports.periodMonth',
};

const getRangeForPreset = (
  preset: PeriodPreset,
): { start: number; end: number; labelKey: string } => {
  const now = dayjs();
  if (preset === 'today') {
    return {
      start: now.startOf('day').valueOf(),
      end: now.endOf('day').valueOf(),
      labelKey: PERIOD_KEYS.today,
    };
  }
  if (preset === 'yesterday') {
    const d = now.subtract(1, 'day');
    return {
      start: d.startOf('day').valueOf(),
      end: d.endOf('day').valueOf(),
      labelKey: PERIOD_KEYS.yesterday,
    };
  }
  if (preset === '7days') {
    return {
      start: now.subtract(6, 'day').startOf('day').valueOf(),
      end: now.endOf('day').valueOf(),
      labelKey: PERIOD_KEYS['7days'],
    };
  }
  return {
    start: now.startOf('month').valueOf(),
    end: now.endOf('day').valueOf(),
    labelKey: PERIOD_KEYS.month,
  };
};

type KpiProps = {
  label: string;
  value: string;
  subLabel?: string;
};

const KpiCard = ({ label, value, subLabel }: KpiProps) => (
  <View style={styles.kpiCard}>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text numberOfLines={1} adjustsFontSizeToFit style={styles.kpiValue}>
      {value}
    </Text>
    {subLabel ? <Text style={styles.kpiSub}>{subLabel}</Text> : null}
  </View>
);

type BarChartProps = {
  points: Array<{ date: string; omzet: number }>;
};

const SimpleBarChart = ({ points }: BarChartProps) => {
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.omzet)), [points]);
  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartBars}>
        {points.map((point) => {
          const heightPct = max > 0 ? Math.max(4, (point.omzet / max) * 100) : 4;
          const shortLabel = dayjs(point.date).format('DD/MM');
          return (
            <View key={point.date} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${heightPct}%` as unknown as number }]} />
              </View>
              <Text numberOfLines={1} style={styles.barLabel}>
                {shortLabel}
              </Text>
            </View>
          );
        })}
      </View>
      {points.length === 0 ? (
        <Text style={styles.chartEmpty}>—</Text>
      ) : null}
    </View>
  );
};

type SectionProps = {
  title: string;
  subtitle?: string;
  onExport?: () => void;
  exportLabel: string;
  children: React.ReactNode;
};

const ReportSection = ({ title, subtitle, onExport, exportLabel, children }: SectionProps) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {onExport ? (
        <TouchableOpacity onPress={onExport} style={styles.exportButton}>
          <Text style={styles.exportButtonText}>{exportLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

const RowKeyValue = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.kvRow}>
    <Text style={styles.kvLabel}>{label}</Text>
    <Text style={styles.kvValue}>{value}</Text>
  </View>
);

export const ReportsDashboardScreen = () => {
  const { t } = useTranslation();

  const reportService = useMemo(() => new ReportService(database), []);
  const shiftService = useMemo(() => new ShiftService(database), []);

  const [period, setPeriod] = useState<PeriodPreset>('today');
  const range = useMemo(() => getRangeForPreset(period), [period]);
  const periodLabel = t(range.labelKey);

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<{
    omzet: number;
    transactionCount: number;
    averageBasket: number;
    discountTotal: number;
    taxTotal: number;
  } | null>(null);
  const [breakdown, setBreakdown] = useState<{
    cash: number;
    qris: number;
    debit: number;
    transfer: number;
    total: number;
  } | null>(null);
  const [trend, setTrend] = useState<Array<{ date: string; omzet: number; transactionCount: number }>>(
    [],
  );
  const [profit, setProfit] = useState<Awaited<ReturnType<ReportService['getProfitReport']>> | null>(null);
  const [topProducts, setTopProducts] = useState<Awaited<ReturnType<ReportService['getTopProducts']>>>(
    [],
  );
  const [inventory, setInventory] = useState<Awaited<
    ReturnType<ReportService['getInventoryReport']>
  > | null>(null);
  const [debtAging, setDebtAging] = useState<Awaited<
    ReturnType<ReportService['getDebtAgingReport']>
  > | null>(null);
  const [shiftRows, setShiftRows] = useState<
    Array<{
      openedAt: number;
      closedAt: number | null;
      userName: string;
      transactionCount: number;
      totalSales: number;
      expectedCash: number | null;
      closingCash: number | null;
      difference: number | null;
      status: string;
    }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const users = await database
        .get<User>('users')
        .query()
        .fetch()
        .catch(() => [] as User[]);
      const map = new Map<string, string>();
      for (const u of users) {
        const deleted = u._getRaw('deleted') as boolean | undefined;
        if (!deleted) map.set(u.id, u.name);
      }

      const [salesReport, paymentBreakdown, dailyTrend, profitReport, top, inv, aging] =
        await Promise.all([
          reportService.getSalesReport(range),
          reportService.getPaymentBreakdown(range),
          reportService.getDailySalesTrend(range),
          reportService.getProfitReport(range),
          reportService.getTopProducts(range, 10),
          reportService.getInventoryReport(),
          reportService.getDebtAgingReport(),
        ]);
      setSales(salesReport);
      setBreakdown(paymentBreakdown);
      setTrend(dailyTrend);
      setProfit(profitReport);
      setTopProducts(top);
      setInventory(inv);
      setDebtAging(aging);

      const allShifts = await shiftService.listShifts();
      const filtered = allShifts.filter((shift) => {
        const o = shift.openedAt;
        return o >= range.start && o <= range.end;
      });
      const useShifts = filtered.length > 0 ? filtered : allShifts.slice(0, 10);
      const withSummary = await Promise.all(
        useShifts.map(async (shift) => {
          try {
            const summary = await shiftService.getShiftSummary(shift.id);
            return {
              openedAt: shift.openedAt,
              closedAt: shift.closedAt,
              userName: map.get(shift.userId) ?? shift.userId.slice(0, 8),
              transactionCount: summary.transactionCount,
              totalSales: summary.totalSales,
              expectedCash: shift.expectedCash,
              closingCash: shift.closingCash,
              difference: shift.difference,
              status: shift.status,
            };
          } catch {
            return {
              openedAt: shift.openedAt,
              closedAt: shift.closedAt,
              userName: map.get(shift.userId) ?? shift.userId.slice(0, 8),
              transactionCount: 0,
              totalSales: 0,
              expectedCash: shift.expectedCash,
              closingCash: shift.closingCash,
              difference: shift.difference,
              status: shift.status,
            };
          }
        }),
      );
      setShiftRows(withSummary);
    } finally {
      setLoading(false);
    }
  }, [range, reportService, shiftService]);

  React.useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleExportSales = useCallback(async () => {
    if (!sales || !breakdown) return;
    const csvSales = buildSalesSummaryCsv({
      periodLabel,
      rangeStart: range.start,
      rangeEnd: range.end,
      omzet: sales.omzet,
      transactionCount: sales.transactionCount,
      averageBasket: sales.averageBasket,
      discountTotal: sales.discountTotal,
      taxTotal: sales.taxTotal,
    });
    const csvBreakdown = buildPaymentBreakdownCsv({ periodLabel, breakdown });
    const csvTrend = buildDailyTrendCsv(periodLabel, trend);
    const combined = [csvSales, '', csvBreakdown, '', csvTrend].join('\n');
    await shareCsv(combined, csvFileName('penjualan', periodLabel));
  }, [breakdown, periodLabel, range.end, range.start, sales, trend]);

  const handleExportProfit = useCallback(async () => {
    if (!profit) return;
    const summary = buildProfitSummaryCsv({
      periodLabel,
      omzet: profit.omzet,
      costTotalEstimate: profit.costTotalEstimate,
      grossProfitEstimate: profit.grossProfitEstimate,
      marginPercent: profit.marginPercent,
    });
    const prodCsv = buildTopProductsCsv(
      periodLabel,
      profit.perProduct.map((p) => ({
        productName: p.productName,
        qty: p.qty,
        revenue: p.revenue,
        costEstimate: p.costEstimate,
        profitEstimate: p.profitEstimate,
      })),
    );
    const catCsvHeader = 'periode,kategori,qty,omzet,hpp_estimasi,laba_estimasi';
    const catRows = profit.perCategory
      .map(
        (c) =>
          `${periodLabel},${c.categoryName.replace(/"/g, '""')},${c.qty},${c.revenue},${c.costEstimate},${c.profitEstimate}`,
      )
      .join('\n');
    const combined = [summary, '', prodCsv, '', catCsvHeader, catRows].join('\n');
    await shareCsv(combined, csvFileName('laba_kotor', periodLabel));
  }, [periodLabel, profit]);

  const handleExportProducts = useCallback(async () => {
    if (!topProducts) return;
    const csv = buildTopProductsCsv(
      periodLabel,
      topProducts.map((p) => ({
        productName: p.productName,
        qty: p.qty,
        revenue: p.revenue,
        costEstimate: p.costEstimate,
        profitEstimate: p.profitEstimate,
      })),
    );
    await shareCsv(csv, csvFileName('produk_terlaris', periodLabel));
  }, [periodLabel, topProducts]);

  const handleExportInventory = useCallback(async () => {
    if (!inventory) return;
    const categoryMap = new Map<string, string>();
    try {
      const cats = await database.get('categories').query().fetch();
      for (const c of cats as unknown as Array<{ id: string; name: string }>) {
        categoryMap.set(c.id, c.name);
      }
    } catch {
      // ignore
    }
    let productsForCsv: Array<{
      name: string;
      stock: number;
      costPrice: number;
      value: number;
      minStock: number;
      categoryName: string;
    }> = [];
    try {
      const products = await database.get('products').query().fetch();
      productsForCsv = (products as unknown as Array<{
        name: string;
        stock: number;
        costPrice: number;
        minStock: number;
        categoryId: string | null;
      }>).map((p) => ({
        name: p.name,
        stock: p.stock,
        costPrice: p.costPrice,
        value: p.stock * p.costPrice,
        minStock: p.minStock,
        categoryName: p.categoryId ? categoryMap.get(p.categoryId) ?? '-' : t('reports.noCategory'),
      }));
    } catch {
      productsForCsv = [];
    }
    const csv = buildInventoryCsv({
      totalValue: inventory.totalValue,
      totalSku: inventory.totalSku,
      totalUnits: inventory.totalUnits,
      lowStockCount: inventory.lowStockCount,
      products: productsForCsv,
    });
    await shareCsv(csv, csvFileName('stok', periodLabel));
  }, [inventory, periodLabel, t]);

  const handleExportDebts = useCallback(async () => {
    if (!debtAging) return;
    const csv = buildDebtAgingCsv({
      totalOutstanding: debtAging.totalOutstanding,
      outstandingCount: debtAging.outstandingCount,
      buckets: debtAging.buckets,
      perCustomer: debtAging.perCustomer,
    });
    await shareCsv(csv, csvFileName('piutang', periodLabel));
  }, [debtAging, periodLabel]);

  const handleExportShifts = useCallback(async () => {
    const csv = buildShiftCsv(shiftRows);
    await shareCsv(csv, csvFileName('shift', periodLabel));
  }, [periodLabel, shiftRows]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.orange[500]} />
        <Text style={styles.loadingText}>{t('reports.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.periodRow}>
        {(Object.keys(PERIOD_KEYS) as PeriodPreset[]).map((preset) => {
          const active = period === preset;
          return (
            <TouchableOpacity
              key={preset}
              onPress={() => setPeriod(preset)}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}>
              <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                {t(PERIOD_KEYS[preset])}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.dashboardTitle}>{t('reports.dashboardTitle')}</Text>
      <Text style={styles.dashboardSubtitle}>{periodLabel} · {dayjs(range.start).format('DD MMM YYYY')} — {dayjs(range.end).format('DD MMM YYYY')}</Text>

      <View style={styles.kpiGrid}>
        <KpiCard label={t('reports.kpiOmzet')} value={formatRupiah(sales?.omzet ?? 0)} />
        <KpiCard label={t('reports.kpiTransactions')} value={String(sales?.transactionCount ?? 0)} subLabel={`${t('reports.avgBasket')} ${formatRupiah(sales?.averageBasket ?? 0)}`} />
        <KpiCard label={t('reports.kpiProfitEstimate')} value={formatRupiah(profit?.grossProfitEstimate ?? 0)} subLabel={profit?.marginPercent !== null && profit?.marginPercent !== undefined ? `${profit?.marginPercent}% ${t('reports.margin')}` : t('reports.noMargin')} />
        <KpiCard label={t('reports.kpiDiscountTax')} value={`${formatRupiah(sales?.discountTotal ?? 0)}`} subLabel={`${t('reports.taxLabel')} ${formatRupiah(sales?.taxTotal ?? 0)}`} />
      </View>
      <Text style={styles.profitNote}>{t('reports.profitNote')}</Text>

      <ReportSection
        title={t('reports.salesTitle')}
        subtitle={t('reports.salesSubtitle')}
        exportLabel={t('reports.exportCsv')}
        onExport={handleExportSales}>
        {sales ? (
          <>
            <RowKeyValue label={t('reports.salesOmzet')} value={formatRupiah(sales.omzet)} />
            <RowKeyValue label={t('reports.salesCount')} value={String(sales.transactionCount)} />
            <RowKeyValue label={t('reports.salesAverage')} value={formatRupiah(sales.averageBasket)} />
            <View style={styles.divider} />
            <Text style={styles.miniHeader}>{t('reports.trendTitle')}</Text>
            <SimpleBarChart points={trend} />
            <View style={styles.divider} />
            <Text style={styles.miniHeader}>{t('reports.breakdownTitle')}</Text>
            {breakdown ? (
              <>
                <RowKeyValue label={t('payment.methodCash')} value={formatRupiah(breakdown.cash)} />
                <RowKeyValue label={t('payment.methodQris')} value={formatRupiah(breakdown.qris)} />
                <RowKeyValue label={t('payment.methodDebit')} value={formatRupiah(breakdown.debit)} />
                <RowKeyValue label={t('payment.methodTransfer')} value={formatRupiah(breakdown.transfer)} />
                <RowKeyValue label={t('reports.total')} value={formatRupiah(breakdown.total)} />
              </>
            ) : null}
          </>
        ) : (
          <Text style={styles.emptyText}>{t('reports.emptySales')}</Text>
        )}
      </ReportSection>

      <ReportSection
        title={t('reports.profitTitle')}
        subtitle={t('reports.profitSubtitle')}
        exportLabel={t('reports.exportCsv')}
        onExport={handleExportProfit}>
        {profit ? (
          <>
            <RowKeyValue label={t('reports.omzetLabel')} value={formatRupiah(profit.omzet)} />
            <RowKeyValue label={t('reports.costLabel')} value={formatRupiah(profit.costTotalEstimate)} />
            <RowKeyValue label={t('reports.profitLabel')} value={formatRupiah(profit.grossProfitEstimate)} />
            <RowKeyValue label={t('reports.marginLabel')} value={profit.marginPercent === null ? '-' : `${profit.marginPercent}%`} />
            <View style={styles.divider} />
            <Text style={styles.miniHeader}>{t('reports.perProductTitle')}</Text>
            {profit.perProduct.length === 0 ? (
              <Text style={styles.emptyText}>{t('reports.emptyProfitProduct')}</Text>
            ) : (
              profit.perProduct.slice(0, 5).map((item) => (
                <View key={item.productId} style={styles.productRow}>
                  <View style={styles.productRowLeft}>
                    <Text numberOfLines={1} style={styles.productName}>{item.productName}</Text>
                    <Text style={styles.productMeta}>{`${item.qty} pcs · ${formatRupiah(item.revenue)}`}</Text>
                  </View>
                  <Text style={styles.productProfit}>{formatRupiah(item.profitEstimate)}</Text>
                </View>
              ))
            )}
            <View style={styles.divider} />
            <Text style={styles.miniHeader}>{t('reports.perCategoryTitle')}</Text>
            {profit.perCategory.length === 0 ? (
              <Text style={styles.emptyText}>{t('reports.emptyCategory')}</Text>
            ) : (
              profit.perCategory.map((cat) => (
                <RowKeyValue key={String(cat.categoryId)} label={cat.categoryName} value={formatRupiah(cat.profitEstimate)} />
              ))
            )}
          </>
        ) : (
          <Text style={styles.emptyText}>{t('reports.emptyProfit')}</Text>
        )}
      </ReportSection>

      <ReportSection
        title={t('reports.topProductsTitle')}
        subtitle={t('reports.topProductsSubtitle')}
        exportLabel={t('reports.exportCsv')}
        onExport={handleExportProducts}>
        {topProducts.length === 0 ? (
          <Text style={styles.emptyText}>{t('reports.emptyTopProducts')}</Text>
        ) : (
          topProducts.map((item, index) => (
            <View key={item.productId} style={styles.rankedRow}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>{index + 1}</Text>
              </View>
              <View style={styles.productRowLeft}>
                <Text numberOfLines={1} style={styles.productName}>{item.productName}</Text>
                <Text style={styles.productMeta}>{`${item.qty} pcs · ${formatRupiah(item.revenue)} · ${t('reports.margin')} ${formatRupiah(item.profitEstimate)}`}</Text>
              </View>
            </View>
          ))
        )}
      </ReportSection>

      <ReportSection
        title={t('reports.inventoryTitle')}
        subtitle={t('reports.inventorySubtitle')}
        exportLabel={t('reports.exportCsv')}
        onExport={handleExportInventory}>
        {inventory ? (
          <>
            <RowKeyValue label={t('reports.inventoryValue')} value={formatRupiah(inventory.totalValue)} />
            <RowKeyValue label={t('reports.inventorySku')} value={String(inventory.totalSku)} />
            <RowKeyValue label={t('reports.inventoryUnits')} value={String(inventory.totalUnits)} />
            <RowKeyValue label={t('reports.lowStockLabel')} value={String(inventory.lowStockCount)} />
            <View style={styles.divider} />
            <Text style={styles.miniHeader}>{t('reports.lowStockTitle')}</Text>
            {inventory.lowStockProducts.length === 0 ? (
              <Text style={styles.emptyText}>{t('reports.noLowStock')}</Text>
            ) : (
              inventory.lowStockProducts.slice(0, 5).map((product) => (
                <RowKeyValue key={product.id} label={product.name} value={`${product.stock} / min ${product.minStock} · ${formatRupiah(product.stock * product.costPrice)}`} />
              ))
            )}
            <View style={styles.divider} />
            <Text style={styles.miniHeader}>{t('reports.categoryValueTitle')}</Text>
            {inventory.categoryValues.map((cat) => (
              <RowKeyValue key={String(cat.categoryId)} label={cat.categoryName} value={`${formatRupiah(cat.value)} · ${cat.skuCount} SKU`} />
            ))}
          </>
        ) : (
          <Text style={styles.emptyText}>{t('reports.emptyInventory')}</Text>
        )}
      </ReportSection>

      <ReportSection
        title={t('reports.debtTitle')}
        subtitle={t('reports.debtSubtitle')}
        exportLabel={t('reports.exportCsv')}
        onExport={handleExportDebts}>
        {debtAging ? (
          <>
            <RowKeyValue label={t('reports.totalOutstanding')} value={formatRupiah(debtAging.totalOutstanding)} />
            <RowKeyValue label={t('reports.outstandingCount')} value={String(debtAging.outstandingCount)} />
            <View style={styles.divider} />
            <Text style={styles.miniHeader}>{t('reports.agingTitle')}</Text>
            {debtAging.buckets.map((bucket) => (
              <RowKeyValue key={bucket.key} label={bucket.label} value={`${bucket.count} · ${formatRupiah(bucket.outstanding)}`} />
            ))}
            <View style={styles.divider} />
            <Text style={styles.miniHeader}>{t('reports.perCustomerTitle')}</Text>
            {debtAging.perCustomer.length === 0 ? (
              <Text style={styles.emptyText}>{t('reports.emptyDebts')}</Text>
            ) : (
              debtAging.perCustomer.slice(0, 5).map((customer) => (
                <RowKeyValue key={customer.customerId} label={customer.customerName ?? t('debts.unknownCustomer')} value={`${formatRupiah(customer.outstanding)} · ${customer.debtCount} bon`} />
              ))
            )}
          </>
        ) : (
          <Text style={styles.emptyText}>{t('reports.emptyDebts')}</Text>
        )}
      </ReportSection>

      <ReportSection
        title={t('reports.shiftTitle')}
        subtitle={t('reports.shiftSubtitle')}
        exportLabel={t('reports.exportCsv')}
        onExport={handleExportShifts}>
        {shiftRows.length === 0 ? (
          <Text style={styles.emptyText}>{t('reports.emptyShifts')}</Text>
        ) : (
          shiftRows.map((shift, index) => {
            const isDiffPositive = (shift.difference ?? 0) > 0;
            const isDiffNegative = (shift.difference ?? 0) < 0;
            return (
              <View key={`${shift.openedAt}-${index}`} style={styles.shiftRow}>
                <View style={styles.shiftRowTop}>
                  <Text style={styles.shiftUser}>{shift.userName}</Text>
                  <View style={[styles.shiftStatus, shift.status === 'open' ? styles.shiftStatusOpen : styles.shiftStatusClosed]}>
                    <View style={[styles.shiftDot, shift.status === 'open' ? styles.shiftDotOpen : styles.shiftDotClosed]} />
                    <Text style={styles.shiftStatusText}>{shift.status === 'open' ? t('shift.statusOpen') : t('shift.statusClosed')}</Text>
                  </View>
                </View>
                <Text style={styles.shiftDate}>{dayjs(shift.openedAt).format('DD MMM YYYY HH:mm')} {shift.closedAt ? `→ ${dayjs(shift.closedAt).format('DD MMM HH:mm')}` : ''}</Text>
                <View style={styles.shiftMetrics}>
                  <Text style={styles.shiftMetric}>{`${shift.transactionCount} trx · ${formatRupiah(shift.totalSales)}`}</Text>
                  <Text style={[styles.shiftMetric, isDiffPositive && styles.shiftDiffPositive, isDiffNegative && styles.shiftDiffNegative]}>
                    {shift.difference === null || shift.difference === undefined ? '-' : shift.difference === 0 ? t('shift.differenceZero') : shift.difference > 0 ? t('shift.differencePositive', { amount: formatRupiah(shift.difference) }) : t('shift.differenceNegative', { amount: formatRupiah(Math.abs(shift.difference)) })}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ReportSection>

      <View style={styles.footerSpacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.white[300],
    marginTop: spacing.md,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
  },
  chip: {
    borderRadius: radius.pill,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  chipInactive: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
  },
  chipText: {
    ...typography.caption,
  },
  chipTextActive: {
    color: colors.black[900],
    fontWeight: '700',
  },
  chipTextInactive: {
    color: colors.white[300],
  },
  dashboardTitle: {
    ...typography.title,
    color: colors.white[50],
  },
  dashboardSubtitle: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  kpiCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
  },
  kpiLabel: {
    ...typography.micro,
    color: colors.white[150],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  kpiValue: {
    ...typography.title,
    color: colors.white[50],
    marginTop: spacing.xs,
  },
  kpiSub: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.xs,
  },
  profitNote: {
    ...typography.micro,
    color: colors.white[150],
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.white[50],
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  exportButton: {
    borderColor: colors.black[600],
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.black[700],
  },
  exportButtonText: {
    ...typography.caption,
    color: colors.white[300],
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 4,
  },
  kvLabel: {
    ...typography.body,
    color: colors.white[150],
    flex: 1,
  },
  kvValue: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  divider: {
    backgroundColor: colors.black[600],
    height: 1,
    marginVertical: spacing.sm,
  },
  miniHeader: {
    ...typography.micro,
    color: colors.white[300],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  chartWrap: {
    paddingVertical: spacing.sm,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    minHeight: 96,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  barTrack: {
    backgroundColor: colors.black[700],
    borderRadius: radius.input,
    width: '100%',
    height: 96,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: colors.orange[500],
    borderRadius: radius.input,
    width: '100%',
  },
  barLabel: {
    ...typography.micro,
    color: colors.white[150],
    fontSize: 10,
  },
  chartEmpty: {
    ...typography.caption,
    color: colors.white[150],
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  productRowLeft: {
    flex: 1,
  },
  productName: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  productMeta: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  productProfit: {
    ...typography.body,
    color: colors.green[500],
    fontWeight: '600',
  },
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  rankBadge: {
    backgroundColor: colors.orange[500],
    borderRadius: radius.pill,
    height: 28,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  rankBadgeText: {
    ...typography.caption,
    color: colors.black[900],
    fontWeight: '700',
  },
  shiftRow: {
    borderBottomColor: colors.black[600],
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  shiftRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shiftUser: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  shiftStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  shiftStatusOpen: {
    backgroundColor: colors.green[500] + '22',
    borderColor: colors.green[500],
  },
  shiftStatusClosed: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
  },
  shiftDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  shiftDotOpen: {
    backgroundColor: colors.green[500],
  },
  shiftDotClosed: {
    backgroundColor: colors.white[150],
  },
  shiftStatusText: {
    ...typography.micro,
    color: colors.white[300],
    fontWeight: '600',
  },
  shiftDate: {
    ...typography.caption,
    color: colors.white[150],
  },
  shiftMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  shiftMetric: {
    ...typography.caption,
    color: colors.white[300],
  },
  shiftDiffPositive: {
    color: colors.green[500],
    fontWeight: '600',
  },
  shiftDiffNegative: {
    color: colors.red[500],
    fontWeight: '600',
  },
  emptyText: {
    ...typography.body,
    color: colors.white[150],
  },
  footerSpacer: {
    height: spacing.xl,
  },
});
