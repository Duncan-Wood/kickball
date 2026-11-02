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
