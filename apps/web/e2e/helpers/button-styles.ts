import { expect, type Locator } from '@playwright/test';

export async function expectPillLabelButton(locator: Locator) {
  await expect(locator).toHaveCSS('border-radius', /999px/);
  // Some browsers report `inline-flex` as computed `flex`.
  await expect(locator).toHaveCSS('display', /^(flex|inline-flex)$/);
  await expect(locator).toHaveCSS('min-height', '44px');
  await expect(locator).toHaveCSS('box-shadow', /^(none|.*0px 0px 0px 0px.*)$/);
}

export async function expectPillLabelButtonFlatOnHover(locator: Locator) {
  await locator.hover();
  await expect(locator).toHaveCSS('box-shadow', /^(none|.*0px 0px 0px 0px.*)$/);
}

export async function expectSquareIconButton(locator: Locator) {
  await expect(locator).toHaveCSS('border-radius', /8px/);
}

