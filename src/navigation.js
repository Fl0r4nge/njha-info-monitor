export async function runNavigationSteps(page, steps = []) {
  for (const step of steps) {
    const locator = buildLocator(page, step);
    const count = await locator.count();
    if (count === 0) {
      throw new Error(`Navigation target not found: ${describeStep(step)}`);
    }

    const index = step.nth ?? 0;
    if (index >= count) {
      throw new Error(`Navigation target index ${index} out of range for ${describeStep(step)}; found ${count}`);
    }

    await locator.nth(index).click({ timeout: step.timeoutMs || 10000 });
    await page.waitForLoadState('domcontentloaded', { timeout: step.waitTimeoutMs || 10000 }).catch(() => {});

    if (step.waitForSelector) {
      await page.waitForSelector(step.waitForSelector, { timeout: step.waitTimeoutMs || 10000 });
    }
  }
}

function buildLocator(page, step) {
  if (step.selector) {
    return page.locator(step.selector);
  }

  if (step.role && step.name) {
    return page.getByRole(step.role, { name: step.name, exact: step.exact ?? true });
  }

  if (step.text) {
    return page.getByText(step.text, { exact: step.exact ?? true });
  }

  throw new Error('Navigation step requires selector, role/name, or text');
}

function describeStep(step) {
  return step.selector || `${step.role || 'text'}:${step.name || step.text || ''}`;
}
