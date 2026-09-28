export const slotLimit = 30;

export function emptyBook() { return { active: null, slots: [] }; }

export function createSlot(book, scenario, summary, name) {
  if (book.slots.length >= slotLimit) return null;
  const slot = {
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`,
    name,
    updated: Date.now(),
    summary: summary ? structuredClone(summary) : null,
    modelVersion: summary?.modelVersion ?? null,
    networkVersion: scenario.networkVersion || null,
    scenario: structuredClone(scenario)
  };
  book.slots.push(slot);
  book.active = slot.id;
  return slot;
}

export function activateSlot(book, id, current) {
  const leaving = book.slots.find(slot => slot.id === book.active);
  if (leaving && current?.scenario) {
    leaving.scenario = structuredClone(current.scenario);
    if (current.summary) leaving.summary = structuredClone(current.summary);
    leaving.updated = Date.now();
    leaving.modelVersion = current.summary?.modelVersion ?? leaving.modelVersion;
    leaving.networkVersion = current.scenario.networkVersion || leaving.networkVersion;
  }
  const next = book.slots.find(slot => slot.id === id);
  if (!next || next.id === leaving?.id && book.active === id) return next || null;
  book.active = next.id;
  return next;
}

export function duplicateSlot(book, id) {
  const source = book.slots.find(slot => slot.id === id);
  if (!source || book.slots.length >= slotLimit) return null;
  const slot = {
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`,
    name: source.name,
    updated: Date.now(),
    summary: source.summary ? structuredClone(source.summary) : null,
    modelVersion: source.modelVersion,
    networkVersion: source.networkVersion,
    scenario: structuredClone(source.scenario)
  };
  book.slots.push(slot);
  return slot;
}

export function renameSlot(book, id, name) {
  const slot = book.slots.find(item => item.id === id);
  if (!slot) return null;
  slot.name = name;
  slot.updated = Date.now();
  return slot;
}

export function deleteSlot(book, id) {
  const index = book.slots.findIndex(slot => slot.id === id);
  if (index < 0) return book.active;
  book.slots.splice(index, 1);
  if (book.active === id) book.active = book.slots[0]?.id || null;
  return book.active;
}
