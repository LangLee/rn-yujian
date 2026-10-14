import React from 'react';
import { render } from '@testing-library/react-native';
import { AppIcon, APP_ICON_NAMES } from '../src/components/icons/AppIcon';

test('AppIcon 用真实 react-native-svg 渲染全部图标不抛错', () => {
  for (const name of APP_ICON_NAMES) {
    const utils = render(<AppIcon name={name} size={20} color="#0B2D4B" />);
    expect(utils.toJSON()).toBeTruthy();
  }
});
