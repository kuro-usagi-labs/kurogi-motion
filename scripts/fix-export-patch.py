from pathlib import Path

path = Path(__file__).resolve().parents[1] / "scripts/patch-export-experience.py"
text = path.read_text(encoding="utf-8")
old = """    '            template-audit.log\\n            effect-audit.log\\n',
    '            template-audit.log\\n            export-audit.log\\n            effect-audit.log\\n',
"""
new = """    '            template-audit.log\\n            shape-audit.log\\n            effect-audit.log\\n',
    '            template-audit.log\\n            shape-audit.log\\n            export-audit.log\\n            effect-audit.log\\n',
"""
if old not in text:
    raise RuntimeError("Export patch CI insertion block was not found.")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Export patch CI insertion fixed.")
