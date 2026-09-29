export function toJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `goals-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCSV(data) {
  const catName = Object.fromEntries(data.categories.map((c) => [c.id, c.name]));
  const rows = [
    ['id', 'category', 'title', 'notes', 'link', 'is_checklist', 'status', 'created_at', 'updated_at', 'completed_at'],
    ...data.items.map((i) => [
      i.id,
      catName[i.category_id] ?? '',
      `"${(i.title ?? '').replace(/"/g, '""')}"`,
      `"${(i.notes ?? '').replace(/"/g, '""')}"`,
      i.link ?? '',
      i.is_checklist ? 'yes' : 'no',
      i.status,
      i.created_at,
      i.updated_at,
      i.completed_at ?? '',
    ]),
  ];
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `goals-backup-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
