from pathlib import Path

path = Path(__file__).resolve().parents[1] / "scripts/audit-shapes.mjs"
text = path.read_text(encoding="utf-8")
text = text.replace('rendererSource.includes("preserveAspectRatio="none"")', 'rendererSource.includes(\'preserveAspectRatio="none"\')')
path.write_text(text, encoding="utf-8")
print("Shape audit source quote fixed.")
