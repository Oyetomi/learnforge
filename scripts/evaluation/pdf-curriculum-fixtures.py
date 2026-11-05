from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".lazyweb/pdf-curriculum-qa")
root.mkdir(parents=True, exist_ok=True)
chapters=[('1. Build a budget','A budget is a plan for money coming in and going out. Begin with take-home income. Distinguish essential bills from flexible spending.'),('2. Save for surprises','An emergency reserve helps pay unexpected costs without borrowing. Start with a small amount and build a habit.'),('3. Compare borrowing costs','Interest is the cost of borrowing. Compare the total repaid and the timing of repayments, not only the advertised monthly amount.')]
for mode in ['bookmarks','contents','no-contents','scanned']:
 c=canvas.Canvas(str(root/f'{mode}.pdf'),pagesize=A4,pageCompression=1)
 c.setTitle('Everyday Money - authored import test')
 if mode!='scanned':
  c.setFont('Helvetica-Bold',26); c.drawString(55,765,'Everyday Money')
  c.setFont('Helvetica',12); c.drawString(55,730,'Authored PDF import fixture. No personal or financial data.')
 c.showPage()
 if mode=='contents':
  c.setFont('Helvetica-Bold',22);c.drawString(55,765,'Contents')
  for i,(title,_) in enumerate(chapters):
   c.setFont('Helvetica',13);c.drawString(55,710-i*40,title+' ........................ '+str(i+1))
  c.showPage()
 for i,(title,text) in enumerate(chapters):
  if mode=='scanned':
   c.setFillColorRGB(.88,.88,.88);c.rect(55,510,480,250,fill=1,stroke=0)
   c.showPage();continue
  if mode=='bookmarks':
   c.bookmarkPage(f'chapter-{i}');c.addOutlineEntry(title,f'chapter-{i}',level=0)
  c.setFont('Helvetica-Bold',22);c.drawString(55,765,title)
  from reportlab.lib.utils import simpleSplit
  c.setFont('Helvetica',13)
  for n,line in enumerate(simpleSplit(text,'Helvetica',13,480)):c.drawString(55,715-n*22,line)
  c.showPage()
 c.save()
