

export function ColorSwatches({ colors }: { colors: { paper: string; accent: string; ink: string } }) {
  return (
    <span aria-hidden="true" className="color-swatches">
      <span style={{ background: colors.paper }} />
      <span style={{ background: colors.accent }} />
      <span style={{ background: colors.ink }} />
    </span>
  );
}
