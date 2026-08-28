import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import '../../../i18n';
import { CashPaymentSheet } from '../components/CashPaymentSheet';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const renderSheet = (overrides: Partial<React.ComponentProps<typeof CashPaymentSheet>> = {}) => {
  let tree: TestRenderer.ReactTestRenderer;
  const onClose = overrides.onClose ?? jest.fn();
  const onConfirm = overrides.onConfirm ?? jest.fn().mockResolvedValue(true);
  act(() => {
    tree = TestRenderer.create(
      <CashPaymentSheet
        total={50_000}
        visible
        onClose={onClose}
        onConfirm={onConfirm}
        {...overrides}
      />,
    );
  });
  return { tree: tree!, onClose, onConfirm };
};

const find = (tree: TestRenderer.ReactTestRenderer, testID: string) =>
  tree.root.findByProps({ testID });

const press = (node: { props: { onPress?: () => void } }) => {
  act(() => {
    node.props.onPress?.();
  });
};

describe('CashPaymentSheet (T1.9)', () => {
  it('menampilkan total bayar dan memblokir Bayar saat uang belum diinput', () => {
    const { tree } = renderSheet();

    expect(find(tree, 'payment-total').props.children).toBe('Rp 50.000');
    expect(find(tree, 'payment-received').props.children).toBe('Rp 0');
    expect(find(tree, 'payment-pay').props.disabled).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'payment-insufficient' })).toHaveLength(0);
  });

  it('menampilkan "Kurang Rp X" dan memblokir Bayar saat uang kurang', () => {
    const { tree } = renderSheet();

    press(find(tree, 'payment-shortcut-20000'));

    expect(find(tree, 'payment-insufficient').props.children).toBe('Kurang Rp 30.000');
    expect(find(tree, 'payment-pay').props.disabled).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'payment-change' })).toHaveLength(0);
  });

  it('menampilkan kembalian dan mengizinkan Bayar saat uang cukup', async () => {
    const { tree, onConfirm } = renderSheet();

    press(find(tree, 'payment-shortcut-20000'));
    press(find(tree, 'payment-shortcut-50000'));

    expect(find(tree, 'payment-change').props.children).toBe('Rp 20.000');
    expect(find(tree, 'payment-pay').props.disabled).toBe(false);

    press(find(tree, 'payment-pay'));
    await flush();

    expect(onConfirm).toHaveBeenCalledWith(70_000);
  });

  it('uang pas menetapkan kembalian nol', () => {
    const { tree } = renderSheet();

    press(find(tree, 'payment-exact'));

    expect(find(tree, 'payment-received').props.children).toBe('Rp 50.000');
    expect(find(tree, 'payment-change').props.children).toBe('Rp 0');
    expect(find(tree, 'payment-pay').props.disabled).toBe(false);
  });

  it('pecahan shortcut menumpuk nominal (20rb + 50rb + 100rb)', () => {
    const { tree } = renderSheet({ total: 150_000 });

    press(find(tree, 'payment-shortcut-20000'));
    press(find(tree, 'payment-shortcut-50000'));
    press(find(tree, 'payment-shortcut-100000'));

    expect(find(tree, 'payment-received').props.children).toBe('Rp 170.000');
    expect(find(tree, 'payment-change').props.children).toBe('Rp 20.000');
  });
});
