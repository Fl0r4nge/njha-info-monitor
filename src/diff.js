const DEFAULT_COMPARE_FIELDS = [
  'name',
  'enterprise',
  'status',
  'step',
  'updatedAt',
  'remark',
  'detailUrl'
];

export function projectIdentity(project) {
  if (project.id) {
    return String(project.id);
  }

  const enterprise = project.enterprise || '';
  const name = project.name || '';
  return `${enterprise}::${name}`;
}

export function diffProjects(previousProjects, currentProjects, compareFields = DEFAULT_COMPARE_FIELDS) {
  const previousById = new Map(previousProjects.map((project) => [projectIdentity(project), project]));
  const currentById = new Map(currentProjects.map((project) => [projectIdentity(project), project]));
  const changes = [];

  for (const current of currentProjects) {
    const id = projectIdentity(current);
    const previous = previousById.get(id);

    if (!previous) {
      changes.push({ type: 'added', id, after: current });
      continue;
    }

    const changedFields = compareFields.filter((field) => normalize(previous[field]) !== normalize(current[field]));
    if (changedFields.length > 0) {
      changes.push({
        type: 'changed',
        id,
        before: previous,
        after: current,
        changedFields
      });
    }
  }

  for (const previous of previousProjects) {
    const id = projectIdentity(previous);
    if (!currentById.has(id)) {
      changes.push({ type: 'removed', id, before: previous });
    }
  }

  return changes;
}

function normalize(value) {
  return value == null ? '' : String(value).trim();
}
