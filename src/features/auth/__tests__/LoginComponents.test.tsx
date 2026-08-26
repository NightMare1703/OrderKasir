import * as React from 'react';
import { TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import '../../../i18n';
import { MAX_PIN_DIGITS, PinDots } from '../components/PinDots';
import { NumericKeypad } from '../components/NumericKeypad';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const render = (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree!;
};

describe('PinDots', () => {
  it('merender tepat 6 titik sesuai panjang PIN maksimal', () => {
    const tree = render(<PinDots length={2} />);
    const dots = tree.root.findByType(View).props.children;
    expect(dots.length).toBe(MAX_PIN_DIGITS);
  });

  it('menandai titik terisi sesuai panjang PIN', () => {
    const tree = render(<PinDots length={3} />);
    const dots = tree.root.findByType(View).props.children;
    const filled = dots.filter(
      (dot: React.ReactElement<{ testID?: string }>) =>
        dot.props.testID === 'pin-dot-filled',
    );
    expect(filled.length).toBe(3);
  });
});

describe('NumericKeypad', () => {
  it('meneruskan digit yang ditekan', async () => {
    const onDigit = jest.fn();
    const onDelete = jest.fn();
    const tree = render(
      <NumericKeypad onDelete={onDelete} onDigit={onDigit} />,
    );
    await flush();

    const buttons = tree.root.findAllByType(TouchableOpacity);
    expect(buttons.length).toBe(11);

    act(() => {
      buttons[0].props.onPress();
    });
    expect(onDigit).toHaveBeenCalledWith('1');

    act(() => {
      buttons[9].props.onPress();
    });
    expect(onDigit).toHaveBeenCalledWith('0');

    act(() => {
      buttons[10].props.onPress();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDigit).toHaveBeenCalledTimes(2);
  });

  it('tidak meneruskan input saat disabled', async () => {
    const onDigit = jest.fn();
    const onDelete = jest.fn();
    const tree = render(
      <NumericKeypad disabled onDelete={onDelete} onDigit={onDigit} />,
    );
    await flush();

    const buttons = tree.root.findAllByType(TouchableOpacity);
    for (const button of buttons) {
      expect(button.props.disabled).toBe(true);
    }

    act(() => {
      buttons[4].props.onPress();
    });
    expect(onDigit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('mendefinisikan panjang PIN maksimal 6 digit', () => {
    expect(MAX_PIN_DIGITS).toBe(6);
  });
});
