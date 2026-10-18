from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
import sys
from pathlib import Path

target = Path(sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures/synthetic_invoice_apex_003.pdf").resolve()
inv_num = sys.argv[2] if len(sys.argv) > 2 else "APX-003"
amount = sys.argv[3] if len(sys.argv) > 3 else "95.00"
target.parent.mkdir(parents=True, exist_ok=True)

doc = SimpleDocTemplate(str(target), pagesize=letter, leftMargin=54, rightMargin=54, topMargin=54, bottomMargin=54)
styles = getSampleStyleSheet()

h1_style = ParagraphStyle(
    'InvoiceTitle',
    parent=styles['Heading1'],
    fontName='Helvetica-Bold',
    fontSize=18,
    leading=22,
    spaceAfter=15
)
normal_style = ParagraphStyle(
    'InvoiceBody',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=12,
    leading=16,
    spaceAfter=8
)

story = [
    Paragraph("INVOICE — SYNTHETIC TEST DATA", h1_style),
    Paragraph("Supplier: Apex Office Supplies (Synthetic)", normal_style),
    Paragraph(f"Invoice number: {inv_num}<br/>Date: 2026-10-15<br/>Currency: MYR", normal_style),
    Spacer(1, 10),
]

data = [
    ["Description", "Quantity", "Unit price", "Line total"],
    ["Desk Organiser Deluxe", "1", amount, amount]
]
t = Table(data, colWidths=[200, 80, 100, 100])
t.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
    ('TEXTCOLOR', (0,0), (-1,-1), colors.black),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE', (0,0), (-1,-1), 11),
    ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ('TOPPADDING', (0,0), (-1,-1), 8),
    ('GRID', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
]))
story.append(t)
story.append(Spacer(1, 15))
story.append(Paragraph(f"Subtotal: MYR {amount}<br/>Tax amount: MYR 0.00<br/>Total amount: MYR {amount}", normal_style))
story.append(Spacer(1, 15))
story.append(Paragraph("Invented training fixture. Not a real transaction. Tax shown only for testing; not a statement about applicable tax treatment.", ParagraphStyle('Footer', parent=styles['Normal'], fontSize=9, leading=12, textColor=colors.HexColor('#64748b'))))

doc.build(story)
print(f"Generated {target} ({target.stat().st_size} bytes)")

