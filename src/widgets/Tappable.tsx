// A row, a card or a chip that does something when tapped, and says so to everyone: a button to assistive technology,
// reachable with Tab, run with Enter or Space, with the touch ripple (widgets/ripple.ts). For things that hold buttons
// of their own (a card's map toggle, a row's star) or must keep their inline look (a chip in a line of text), where a
// <button> would not do; anything else that is pressed is a <button>.
import type { ComponentChildren, Ref } from 'preact';

export function Tappable({
  class: cls,
  onClick,
  label,
  tag = 'div',
  style,
  elRef,
  children,
}: {
  class: string;
  onClick: (e: MouseEvent) => void;
  label?: string;
  /** 'span' where it sits in a line of text (a chip, a place's name). */
  tag?: 'div' | 'span';
  style?: Record<string, string>;
  elRef?: Ref<HTMLDivElement>;
  children: ComponentChildren;
}) {
  const Tag = tag;
  return (
    <Tag
      class={cls}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={label}
      ref={elRef as never /* one element type for both tags: the ref is the card's, a div */}
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      {children}
    </Tag>
  );
}
