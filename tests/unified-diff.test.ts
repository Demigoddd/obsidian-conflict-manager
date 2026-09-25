// @vitest-environment happy-dom
import './dom-helpers';
import { describe, expect, it } from 'vitest';
import { UnifiedDiff } from '../src/components/unified-diff';

const NBSP = ' ';

const render = (mainText: string, conflictText: string) => {
  const container = createDiv();

  UnifiedDiff.render(container, mainText, conflictText);
  return container;
};

// One entry per rendered row: [type, main line number, conflict line number, text]
const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.row')).map((row) => {
    const [mainNumber, conflictNumber] = Array.from(row.querySelectorAll('.number')).map(
      (el) => el.textContent,
    );
    const type = ['row-delete', 'row-insert', 'row-unchanged'].find((cls) =>
      row.classList.contains(cls),
    );

    return [type, mainNumber, conflictNumber, row.querySelector('.body')!.textContent];
  });

// The highlighted pieces of one row: [class, text]
const highlights = (row: Element) =>
  Array.from(row.querySelectorAll('.body > span')).map((el) => [el.className, el.textContent]);

const lines = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => `line ${index + from}`);

describe('UnifiedDiff', () => {
  it('reports identical files instead of rendering rows', () => {
    const container = render('a\nb\n', 'a\nb\n');

    expect(container.querySelector('.empty-text')!.textContent).toBe('Files are identical');
    expect(container.querySelectorAll('.row')).toHaveLength(0);
  });

  it('numbers lines on both sides and leaves the missing side empty', () => {
    const container = render('a\nc\nd\n', 'a\nb\nc\n');

    expect(rows(container)).toEqual([
      ['row-unchanged', '1', '1', 'a'],
      ['row-insert', '', '2', 'b'],
      ['row-unchanged', '2', '3', 'c'],
      ['row-delete', '3', '', 'd'],
    ]);
  });

  it('lists a changed line as the removed version followed by the added one', () => {
    const container = render('a\nb\n', 'a\nc\n');

    expect(rows(container)).toEqual([
      ['row-unchanged', '1', '1', 'a'],
      ['row-delete', '2', '', 'b'],
      ['row-insert', '', '2', 'c'],
    ]);
  });

  it('highlights only the changed characters of a paired line', () => {
    const container = render('value: 1\n', 'value: 2\n');
    const [deleted, inserted] = Array.from(container.querySelectorAll('.row'));

    expect(highlights(deleted!)).toEqual([
      ['highlight-soft', 'value: '],
      ['highlight-strong', '1'],
    ]);
    expect(highlights(inserted!)).toEqual([
      ['highlight-soft', 'value: '],
      ['highlight-strong', '2'],
    ]);
  });

  it('highlights whole lines that have no counterpart', () => {
    const container = render('x 1\ny\nz\n', 'x 2\n');
    const rowEls = Array.from(container.querySelectorAll('.row'));

    expect(rows(container)).toEqual([
      ['row-delete', '1', '', 'x 1'],
      ['row-delete', '2', '', 'y'],
      ['row-delete', '3', '', 'z'],
      ['row-insert', '', '1', 'x 2'],
    ]);
    expect(highlights(rowEls[0]!)).toEqual([
      ['highlight-soft', 'x '],
      ['highlight-strong', '1'],
    ]);
    expect(highlights(rowEls[1]!)).toEqual([['highlight-strong', 'y']]);
    expect(highlights(rowEls[2]!)).toEqual([['highlight-strong', 'z']]);
  });

  it('keeps empty lines visible with a non-breaking space', () => {
    const container = render('a\n\nb\n', 'a\nb\n');

    expect(rows(container)).toEqual([
      ['row-unchanged', '1', '1', 'a'],
      ['row-delete', '2', '', NBSP],
      ['row-unchanged', '3', '2', 'b'],
    ]);
  });

  it('shows two lines of context and collapses the rest', () => {
    const before = lines(10);
    const container = render(
      [...before, 'old', ...lines(10, 11)].join('\n'),
      [...before, 'new', ...lines(10, 11)].join('\n'),
    );
    const collapses = Array.from(container.querySelectorAll('.collapse'));

    expect(rows(container)).toEqual([
      ['row-unchanged', '9', '9', 'line 9'],
      ['row-unchanged', '10', '10', 'line 10'],
      ['row-delete', '11', '', 'old'],
      ['row-insert', '', '11', 'new'],
      ['row-unchanged', '12', '12', 'line 11'],
      ['row-unchanged', '13', '13', 'line 12'],
    ]);
    expect(collapses.map((el) => el.querySelector('.collapse-label')!.textContent)).toEqual([
      '8 unchanged lines',
      '8 unchanged lines',
    ]);
    expect(container.firstElementChild!.classList.contains('collapse')).toBe(true);
    expect(container.lastElementChild!.classList.contains('collapse')).toBe(true);
  });

  it('merges the context of nearby changes into one block', () => {
    const container = render('a\n1\n2\n3\n4\nb\n', 'A\n1\n2\n3\n4\nB\n');

    expect(container.querySelectorAll('.collapse')).toHaveLength(0);
    expect(rows(container)).toHaveLength(8);
  });

  it('expands a collapsed block in place', () => {
    const container = render([...lines(6), 'old'].join('\n'), [...lines(6), 'new'].join('\n'));
    const collapse = container.querySelector<HTMLElement>('.collapse')!;

    expect(collapse.querySelector('.collapse-label')!.textContent).toBe('4 unchanged lines');

    collapse.click();

    expect(container.querySelectorAll('.collapse')).toHaveLength(0);
    expect(rows(container).map(([, main, , text]) => [main, text])).toEqual([
      ['1', 'line 1'],
      ['2', 'line 2'],
      ['3', 'line 3'],
      ['4', 'line 4'],
      ['5', 'line 5'],
      ['6', 'line 6'],
      ['7', 'old'],
      ['', 'new'],
    ]);
  });

  it('compares a file against an empty one', () => {
    const container = render('', 'a\nb\n');

    expect(rows(container)).toEqual([
      ['row-insert', '', '1', 'a'],
      ['row-insert', '', '2', 'b'],
    ]);
  });
});
