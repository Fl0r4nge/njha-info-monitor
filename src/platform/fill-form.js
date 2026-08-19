/**
 * 在平台页面上"只填表、不提交"。
 *
 * 这是把数据写回平台的**推荐方式**：录入的活全自动化，不可逆的那一下（点提交）留给人。
 * submit 默认 false，且必须显式传 true 才会去点提交按钮。
 */

/** 支持 element-ui 常见控件：普通输入框、文本域、下拉选择 */
async function fillOne(page, selector, value, { kind = 'auto' } = {}) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) {
    return { selector, ok: false, reason: '页面上找不到该控件' };
  }

  const tag = (await locator.evaluate((el) => el.tagName.toLowerCase())).trim();
  const isSelect = kind === 'select'
    || (await locator.evaluate((el) => el.closest('.el-select') !== null));

  try {
    if (isSelect) {
      await locator.click();
      const option = page.locator(`.el-select-dropdown__item:has-text("${value}")`).first();
      await option.click({ timeout: 5000 });
    } else if (tag === 'input' || tag === 'textarea') {
      await locator.fill(String(value));
    } else {
      await locator.click();
      await page.keyboard.type(String(value));
    }
    return { selector, ok: true, value };
  } catch (error) {
    return { selector, ok: false, reason: error.message || String(error) };
  }
}

/**
 * @param fieldValues {Array<{selector, value, kind?}>}
 * @param options.submit 必须显式 true 才会点提交；默认只填不交
 */
export async function fillPlatformForm(page, fieldValues, { submit = false, submitSelector, logger = console } = {}) {
  const results = [];
  for (const field of fieldValues) {
    results.push(await fillOne(page, field.selector, field.value, { kind: field.kind }));
  }

  const filled = results.filter((r) => r.ok).length;
  logger.log?.(`已填写 ${filled}/${fieldValues.length} 个字段`);

  if (!submit) {
    logger.warn?.('已按默认策略停在"填好未提交"，请人工核对后自行点击提交按钮。');
    return { filled: results, submitted: false };
  }
  if (!submitSelector) {
    throw new Error('要求提交但没有给 submitSelector，拒绝盲点按钮');
  }

  logger.warn?.(`[真实提交] 即将点击 ${submitSelector}`);
  await page.locator(submitSelector).first().click();
  return { filled: results, submitted: true };
}
