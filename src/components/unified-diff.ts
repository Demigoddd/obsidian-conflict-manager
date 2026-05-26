import { diffLines, diffChars } from 'diff';

const CONTEXT_LINES = 2;

interface Row {
    type: 'delete' | 'insert' | 'unchanged';
    text: string;
    mainNumber: number | null;
    conflictNumber: number | null;
    pair?:  string;
}

export class UnifiedDiff {
    static render(container: HTMLElement, mainText: string, conflictText: string): void {
        container.empty();

        const rows = this.buildRows(mainText, conflictText);
        if (!rows.some(r => r.type !== 'unchanged')) return void container.createEl('h4', { text: "Files are identical", cls: "empty-text" });

        this.paint(container, rows);
    }

    private static buildRows(mainText: string, conflictText: string): Row[] {
        const rows: Row[] = [];
        const parts = diffLines(mainText, conflictText);
        let m = 1, c = 1, i = 0;

        while (i < parts.length) {
            const current = parts[i]!, next = parts[i + 1];
            const currentText = current.value.replace(/\n$/, '').split('\n');

            if (current.removed && next?.added) {
                const nextText = next.value.replace(/\n$/, '').split('\n');
                currentText.forEach((t, k) => rows.push({ type: 'delete', text: t, mainNumber: m++, conflictNumber: null, pair: nextText[k] }));
                nextText.forEach((t, k) => rows.push({ type: 'insert', text: t, mainNumber: null, conflictNumber: c++, pair: currentText[k] }));
                i += 2;
                continue;
            }

            if (current.removed) {
                currentText.forEach(t => rows.push({ type: 'delete', text: t, mainNumber: m++, conflictNumber: null }));
                i++;
                continue;
            }

            if (current.added) {
                currentText.forEach(t => rows.push({ type: 'insert', text: t, mainNumber: null, conflictNumber: c++ }));
                i++;
                continue;
            }

            currentText.forEach(t => rows.push({ type: 'unchanged', text: t, mainNumber: m++, conflictNumber: c++ }));
            i++;
        }

        return rows;
    }

    private static paint(wrap: HTMLElement, rows: Row[]): void {
        const show = new Set<number>();
        rows.forEach((r, i) => {
            if (r.type !== 'unchanged') {
                for (let k = Math.max(0, i - CONTEXT_LINES); k <= Math.min(rows.length - 1, i + CONTEXT_LINES); k++) {
                    show.add(k);
                }
            }
        });

        let i = 0;
        while (i < rows.length) {
            if (show.has(i)) {
                if (i > 0 && !show.has(i - 1)) wrap.createDiv({ cls: 'separator' });

                this.paintRow(wrap, rows[i]!);
                i++;
            } else {
                const start = i;
                while (i < rows.length && !show.has(i)) i++;

                this.paintCollapse(wrap, rows.slice(start, i));
            }
        }
    }

    private static paintRow(parent: HTMLElement, row: Row): void {
        const el = parent.createDiv({ cls: `row row-${row.type}` });

        el.createSpan({ cls: 'number', text: row.mainNumber != null ? String(row.mainNumber) : '' });
        el.createSpan({ cls: 'number', text: row.conflictNumber != null ? String(row.conflictNumber) : '' });

        const body = el.createSpan({ cls: 'body' });

        if (row.type === 'unchanged') {
            body.setText(row.text || '\u00A0');
            return;
        }

        if (!row.pair) {
            body.createSpan({ cls: 'highlight-strong', text: row.text || '\u00A0' });
            return;
        }

        // Char-level diff against paired line
        const [from, to] = row.type === 'delete' ? [row.text, row.pair] : [row.pair, row.text];

        diffChars(from, to).forEach(ch => {
            if (ch.removed && row.type === 'insert') return;
            if (ch.added   && row.type === 'delete') return;

            body.createSpan({
                cls: (ch.added || ch.removed) ? 'highlight-strong' : 'highlight-soft',
                text: ch.value || '\u00A0',
            });
        });
    }

    private static paintCollapse(wrap: HTMLElement, hidden: Row[]): void {
        const el = wrap.createDiv({ cls: 'collapse' });

        el.createSpan({ cls: 'collapse-dots', text: '•••' });
        el.createSpan({ cls: 'collapse-label', text: `${hidden.length} unchanged lines` });
        el.createSpan({ cls: 'collapse-action', text: 'Expand' });

        el.addEventListener('click', () => {
            const tmp = document.createElement('div');
            hidden.forEach(r => this.paintRow(tmp as HTMLElement, r));
            while (tmp.firstChild) el.insertAdjacentElement('beforebegin', tmp.firstChild as Element);
            el.remove();
        });
    }
}
