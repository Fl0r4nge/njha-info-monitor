import { projectIdentity } from './diff.js';

export async function extractProjects(page, selectors) {
  await page.waitForSelector(selectors.projectRows);
  const rows = await page.locator(selectors.projectRows).all();
  const projects = [];

  for (const row of rows) {
    const project = await extractProjectFromRow(row, selectors);
    if (project.name || project.enterprise) {
      projects.push(project);
    }
  }

  return projects;
}

export async function extractProjectFromRow(row, selectors) {
  const project = {};

  for (const [field, selector] of Object.entries(selectors.fields || {})) {
    project[field] = await readText(row, selector);
  }

  if (selectors.detailUrl) {
    project.detailUrl = await readHref(row, selectors.detailUrl);
  }

  project.id = project.id || projectIdentity(project);
  return compactProject(project);
}

async function readText(row, selector) {
  const locator = row.locator(selector);
  if (await locator.count() === 0) {
    return '';
  }

  return normalizeText(await locator.first().innerText());
}

async function readHref(row, selector) {
  const locator = row.locator(selector);
  if (await locator.count() === 0) {
    return '';
  }

  return (await locator.first().getAttribute('href')) || '';
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactProject(project) {
  return Object.fromEntries(Object.entries(project).filter(([, value]) => value !== ''));
}
