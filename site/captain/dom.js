import { captain } from './state.js';

export function node(tag, className, text) {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

export function button(text, className, onClick) {
  const created = node('button', className, text);
  created.type = 'button';
  created.addEventListener('click', () => {
    if (!captain.saving) onClick();
  });
  return created;
}

export function formField(labelText, type, name, value) {
  const label = node('label', undefined, labelText);
  const input = node('input');
  input.type = type;
  input.name = name;
  input.value = value;
  label.append(input);
  return label;
}

export function selectField(labelText, name, choices, value) {
  const label = node('label', undefined, labelText);
  const select = node('select');
  select.name = name;
  select.append(...choices.map(([choiceValue, choiceLabel]) => {
    const option = node('option', undefined, choiceLabel);
    option.value = choiceValue;
    return option;
  }));
  select.value = value;
  label.append(select);
  return label;
}

export function confirmAction(message, detail, confirmLabel) {
  const dialog = node('dialog', 'confirm-dialog');
  const actions = node('div', 'game-actions');
  const cancel = node('button', 'panel-action', 'Cancel');
  const confirm = node('button', 'panel-action danger', confirmLabel);
  cancel.type = 'button';
  confirm.type = 'button';
  actions.append(cancel, confirm);
  dialog.append(node('p', undefined, message), node('p', 'captain-hint', detail), actions);
  document.body.append(dialog);
  return new Promise((resolve) => {
    cancel.addEventListener('click', () => dialog.close('cancel'));
    confirm.addEventListener('click', () => dialog.close('confirm'));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'confirm');
    });
    dialog.showModal();
    cancel.focus();
  });
}
