export class StringPanel {
  constructor(element) {
    this.element = element;
  }

  clear() {
    if (this.element) this.element.innerHTML = '';
  }

  showNoStringsMessage() {
    if (!this.element) return;
    this.element.textContent = 'No printable strings located in this executable.';
  }

  render(strings) {
    if (!this.element) return;
    this.clear();
    if (!strings.length) {
      this.showNoStringsMessage();
      return;
    }
    const frag = document.createDocumentFragment();
    const limit = 120;
    let rendered = 0;
    strings.slice(0, limit).forEach((value, index) => {
      if (!value.trim()) return;
      const div = document.createElement('div');
      div.className = 'stringList__item';
      const label = document.createElement('strong');
      label.textContent = `#${index + 1}`;
      const text = document.createElement('span');
      text.textContent = value.trim();
      div.append(label, text);
      frag.appendChild(div);
      rendered++;
    });
    this.element.appendChild(frag);
    if (strings.length > limit) {
      const note = document.createElement('div');
      note.className = 'stringList__item';
      note.textContent = `…and ${strings.length - limit} more strings. Refine the binary to narrow things down.`;
      this.element.appendChild(note);
    } else if (!rendered) {
      this.showNoStringsMessage();
    }
  }
}
