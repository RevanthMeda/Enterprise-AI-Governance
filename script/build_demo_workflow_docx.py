from pathlib import Path

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "ACTURUS_AI_CONTROL_GRID_Live_Demo_Workflow.docx"

# compact_reference_guide preset with one named ACTURUS / AI CONTROL GRID brand override.
PAGE_WIDTH_DXA = 9360
TABLE_INDENT_DXA = 120
CELL_MARGINS = {"top": 80, "bottom": 80, "start": 120, "end": 120}

NAVY = "07101F"
INK = "17243A"
COBALT = "356CFF"
CYAN = "1599B8"
VIOLET = "7569D8"
PALE_BLUE = "EAF2FF"
PALE_CYAN = "EDF9FC"
PALE_VIOLET = "F2EFFF"
MUTED = "5F6D82"
LIGHT_LINE = "D6DFEC"
LIGHT_GRAY = "F4F6F9"
WHITE = "FFFFFF"
GREEN = "177A65"
PALE_GREEN = "EAF7F3"
RED = "A03838"
PALE_RED = "FCEEEE"
GOLD = "8A6400"
PALE_GOLD = "FFF7DF"


def rgb(hex_value: str) -> RGBColor:
    return RGBColor.from_string(hex_value)


def set_run_font(run, name="Calibri", size=None, color=None, bold=None, italic=None):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    if size is not None:
        run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = rgb(color)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def set_paragraph_shading(paragraph, fill):
    p_pr = paragraph._p.get_or_add_pPr()
    shd = p_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        p_pr.append(shd)
    shd.set(qn("w:fill"), fill)
    shd.set(qn("w:val"), "clear")


def set_paragraph_left_border(paragraph, color, size=20, space=7):
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = p_pr.find(qn("w:pBdr"))
    if p_bdr is None:
        p_bdr = OxmlElement("w:pBdr")
        p_pr.append(p_bdr)
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), str(size))
    left.set(qn("w:space"), str(space))
    left.set(qn("w:color"), color)
    p_bdr.append(left)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)
    shd.set(qn("w:val"), "clear")


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=LIGHT_LINE, size=5, inside=True):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    edges = ["top", "left", "bottom", "right"]
    if inside:
        edges += ["insideH", "insideV"]
    for edge in edges:
        element = borders.find(qn(f"w:{edge}"))
        if element is None:
            element = OxmlElement(f"w:{edge}")
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), str(size))
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_table_geometry(table, widths_dxa, indent_dxa=TABLE_INDENT_DXA):
    if sum(widths_dxa) != PAGE_WIDTH_DXA:
        raise ValueError(f"Table widths must total {PAGE_WIDTH_DXA} DXA: {widths_dxa}")
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(PAGE_WIDTH_DXA))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), str(indent_dxa))
    tbl_ind.set(qn("w:type"), "dxa")
    layout = tbl_pr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tbl_pr.append(layout)
    layout.set(qn("w:type"), "fixed")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)

    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            width = widths_dxa[idx]
            cell.width = Inches(width / 1440)
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(width))
            tc_w.set(qn("w:type"), "dxa")
            set_cell_margins(cell, **CELL_MARGINS)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def keep_row_together(row):
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def set_cell_text(cell, text, *, size=9.5, color=INK, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT):
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.15
    p.clear()
    run = p.add_run(text)
    set_run_font(run, size=size, color=color, bold=bold)
    return p


def add_page_field(paragraph):
    run = paragraph.add_run()
    fld_char_begin = OxmlElement("w:fldChar")
    fld_char_begin.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    fld_char_end = OxmlElement("w:fldChar")
    fld_char_end.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char_begin, instr_text, fld_char_end])
    set_run_font(run, size=8, color=MUTED)


def add_hyperlink(paragraph, text, url, color=COBALT):
    part = paragraph.part
    relationship_id = part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), relationship_id)
    run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    r_fonts = OxmlElement("w:rFonts")
    r_fonts.set(qn("w:ascii"), "Calibri")
    r_fonts.set(qn("w:hAnsi"), "Calibri")
    color_node = OxmlElement("w:color")
    color_node.set(qn("w:val"), color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    r_pr.extend([r_fonts, color_node, underline])
    text_node = OxmlElement("w:t")
    text_node.text = text
    run.extend([r_pr, text_node])
    hyperlink.append(run)
    paragraph._p.append(hyperlink)
    return hyperlink


def create_numbering(doc, kind="bullet"):
    numbering = doc.part.numbering_part.element
    abstract_ids = [int(e.get(qn("w:abstractNumId"))) for e in numbering.findall(qn("w:abstractNum"))]
    num_ids = [int(e.get(qn("w:numId"))) for e in numbering.findall(qn("w:num"))]
    abstract_id = max(abstract_ids or [0]) + 1
    num_id = max(num_ids or [0]) + 1

    abstract = OxmlElement("w:abstractNum")
    abstract.set(qn("w:abstractNumId"), str(abstract_id))
    multi = OxmlElement("w:multiLevelType")
    multi.set(qn("w:val"), "singleLevel")
    abstract.append(multi)
    lvl = OxmlElement("w:lvl")
    lvl.set(qn("w:ilvl"), "0")
    start = OxmlElement("w:start")
    start.set(qn("w:val"), "1")
    num_fmt = OxmlElement("w:numFmt")
    num_fmt.set(qn("w:val"), "bullet" if kind == "bullet" else "decimal")
    lvl_text = OxmlElement("w:lvlText")
    lvl_text.set(qn("w:val"), "•" if kind == "bullet" else "%1.")
    lvl_jc = OxmlElement("w:lvlJc")
    lvl_jc.set(qn("w:val"), "left")
    p_pr = OxmlElement("w:pPr")
    tabs = OxmlElement("w:tabs")
    tab = OxmlElement("w:tab")
    tab.set(qn("w:val"), "num")
    tab.set(qn("w:pos"), "540")
    tabs.append(tab)
    ind = OxmlElement("w:ind")
    ind.set(qn("w:left"), "540")
    ind.set(qn("w:hanging"), "270")

    if kind == "bullet":
        r_pr = lvl.find(qn("w:rPr"))
        if r_pr is None:
            r_pr = OxmlElement("w:rPr")
            lvl.append(r_pr)
        r_fonts = r_pr.find(qn("w:rFonts"))
        if r_fonts is None:
            r_fonts = OxmlElement("w:rFonts")
            r_pr.append(r_fonts)
        r_fonts.set(qn("w:ascii"), "Arial")
        r_fonts.set(qn("w:hAnsi"), "Arial")
        r_fonts.set(qn("w:hint"), "default")
    p_pr.extend([tabs, ind])
    lvl.extend([start, num_fmt, lvl_text, lvl_jc, p_pr])
    abstract.append(lvl)
    numbering.append(abstract)

    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(num_id))
    abstract_ref = OxmlElement("w:abstractNumId")
    abstract_ref.set(qn("w:val"), str(abstract_id))
    num.append(abstract_ref)
    numbering.append(num)
    return num_id


def apply_numbering(paragraph, num_id):
    p_pr = paragraph._p.get_or_add_pPr()
    num_pr = p_pr.find(qn("w:numPr"))
    if num_pr is None:
        num_pr = OxmlElement("w:numPr")
        p_pr.append(num_pr)
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    num_id_el = OxmlElement("w:numId")
    num_id_el.set(qn("w:val"), str(num_id))
    num_pr.extend([ilvl, num_id_el])


def patch_numbering_level(doc, num_id, kind):
    numbering = doc.part.numbering_part.element
    num = next(
        element
        for element in numbering.findall(qn("w:num"))
        if element.get(qn("w:numId")) == str(num_id)
    )
    abstract_id = num.find(qn("w:abstractNumId")).get(qn("w:val"))
    abstract = next(
        element
        for element in numbering.findall(qn("w:abstractNum"))
        if element.get(qn("w:abstractNumId")) == abstract_id
    )
    lvl = abstract.find(qn("w:lvl"))
    lvl.find(qn("w:start")).set(qn("w:val"), "1")
    lvl.find(qn("w:numFmt")).set(qn("w:val"), "bullet" if kind == "bullet" else "decimal")
    # Word's built-in bullet level uses the Symbol-font bullet at U+F0B7.
    # Keeping that pairing avoids an empty-square fallback in PDF export.
    lvl.find(qn("w:lvlText")).set(qn("w:val"), "\uf0b7" if kind == "bullet" else "%1.")

    p_pr = lvl.find(qn("w:pPr"))
    if p_pr is None:
        p_pr = OxmlElement("w:pPr")
        lvl.append(p_pr)
    tabs = p_pr.find(qn("w:tabs"))
    if tabs is None:
        tabs = OxmlElement("w:tabs")
        p_pr.append(tabs)
    for child in list(tabs):
        tabs.remove(child)
    tab = OxmlElement("w:tab")
    tab.set(qn("w:val"), "num")
    tab.set(qn("w:pos"), "540")
    tabs.append(tab)
    ind = p_pr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        p_pr.append(ind)
    ind.set(qn("w:left"), "540")
    ind.set(qn("w:hanging"), "270")


def add_bullet(doc, text, bullet_num_id, bold_lead=None):
    p = doc.add_paragraph()
    apply_numbering(p, bullet_num_id)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.25
    if bold_lead and text.startswith(bold_lead):
        lead = p.add_run(bold_lead)
        set_run_font(lead, bold=True, color=INK)
        tail = p.add_run(text[len(bold_lead):])
        set_run_font(tail, color=INK)
    else:
        run = p.add_run(text)
        set_run_font(run, color=INK)
    return p


def add_step(doc, title, decimal_num_id):
    p = doc.add_paragraph(style="Heading 2")
    apply_numbering(p, decimal_num_id)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(title)
    set_run_font(run, size=13, color=COBALT, bold=True)
    return p


def add_body(doc, text, *, bold_lead=None, after=6, keep=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.25
    p.paragraph_format.keep_together = keep
    if bold_lead and text.startswith(bold_lead):
        lead = p.add_run(bold_lead)
        set_run_font(lead, color=INK, bold=True)
        tail = p.add_run(text[len(bold_lead):])
        set_run_font(tail, color=INK)
    else:
        run = p.add_run(text)
        set_run_font(run, color=INK)
    return p


def add_kicker(doc, text, *, after=3):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(after)
    run = p.add_run(text.upper())
    set_run_font(run, size=9.2, color=CYAN, bold=True)
    run.font.letter_spacing = Pt(1.2)
    return p


def add_callout(doc, label, body, *, fill=PALE_BLUE, accent=COBALT, color=INK, after=8):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.16)
    p.paragraph_format.right_indent = Inches(0.12)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.2
    set_paragraph_shading(p, fill)
    set_paragraph_left_border(p, accent)
    lead = p.add_run(f"{label.upper()}  ")
    set_run_font(lead, size=9.5, color=accent, bold=True)
    text = p.add_run(body)
    set_run_font(text, size=10.5, color=color)
    return p


def add_code_block(doc, text, *, fill=NAVY, color=WHITE, after=8):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.16)
    p.paragraph_format.right_indent = Inches(0.12)
    p.paragraph_format.space_before = Pt(3)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.15
    p.paragraph_format.keep_together = True
    set_paragraph_shading(p, fill)
    run = p.add_run(text)
    set_run_font(run, name="Consolas", size=9.1, color=color)
    return p


def add_prompt(doc, label, prompt, *, safe=True):
    fill = PALE_GREEN if safe else PALE_RED
    accent = GREEN if safe else RED
    add_callout(doc, label, prompt, fill=fill, accent=accent, after=7)


def add_section_title(doc, title, subtitle=None):
    p = doc.add_paragraph(style="Heading 1")
    p.paragraph_format.keep_with_next = True
    run = p.add_run(title)
    set_run_font(run, size=16, color=COBALT, bold=True)
    if subtitle:
        s = doc.add_paragraph()
        s.paragraph_format.space_before = Pt(0)
        s.paragraph_format.space_after = Pt(10)
        s.paragraph_format.keep_with_next = True
        run = s.add_run(subtitle)
        set_run_font(run, size=10.5, color=MUTED, italic=True)
    return p


def add_page_break(doc):
    p = doc.add_paragraph()
    p.paragraph_format.page_break_before = True
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = Pt(1)
    run = p.add_run(" ")
    set_run_font(run, size=1, color=WHITE)


def setup_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.font.color.rgb = rgb(INK)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    title = doc.styles["Title"]
    title.font.name = "Calibri"
    title._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    title._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    title.font.size = Pt(29)
    title.font.bold = True
    title.font.color.rgb = rgb(NAVY)
    title.paragraph_format.space_before = Pt(0)
    title.paragraph_format.space_after = Pt(8)
    title.paragraph_format.line_spacing = 1.0

    subtitle = doc.styles["Subtitle"]
    subtitle.font.name = "Calibri"
    subtitle._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    subtitle._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    subtitle.font.size = Pt(13.2)
    subtitle.font.color.rgb = rgb(MUTED)
    subtitle.paragraph_format.space_before = Pt(0)
    subtitle.paragraph_format.space_after = Pt(18)

    for style_name, size, color, before, after in (
        ("Heading 1", 16, COBALT, 18, 10),
        ("Heading 2", 13, COBALT, 14, 7),
        ("Heading 3", 12, "1F4D78", 10, 5),
    ):
        style = doc.styles[style_name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = rgb(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True


def setup_page(doc):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    header = section.header
    hp = header.paragraphs[0]
    hp.paragraph_format.space_before = Pt(0)
    hp.paragraph_format.space_after = Pt(0)
    hp.paragraph_format.tab_stops.add_tab_stop(Inches(6.5), WD_TAB_ALIGNMENT.RIGHT)
    left = hp.add_run("ACTURUS  |  AI CONTROL GRID")
    set_run_font(left, size=8, color=NAVY, bold=True)
    right = hp.add_run("\tPRESENTER RUNBOOK")
    set_run_font(right, size=8, color=CYAN, bold=True)

    footer = section.footer
    fp = footer.paragraphs[0]
    fp.paragraph_format.space_before = Pt(0)
    fp.paragraph_format.space_after = Pt(0)
    fp.paragraph_format.tab_stops.add_tab_stop(Inches(6.5), WD_TAB_ALIGNMENT.RIGHT)
    left = fp.add_run("Synthetic demo data only  |  July 2026")
    set_run_font(left, size=8, color=MUTED)
    page_label = fp.add_run("\tPage ")
    set_run_font(page_label, size=8, color=MUTED)
    add_page_field(fp)


def add_metric_strip(doc):
    table = doc.add_table(rows=1, cols=4)
    set_table_geometry(table, [2340, 2340, 2340, 2340])
    set_table_borders(table, color="C7D5EA", size=5)
    repeat_header(table.rows[0])
    metrics = [
        ("15 MIN", "core story", PALE_BLUE, COBALT),
        ("3 SURFACES", "brand, console, workspace", PALE_CYAN, CYAN),
        ("2 PROMPTS", "allow and block", PALE_VIOLET, VIOLET),
        ("1 CLOSED LOOP", "evidence and incident", LIGHT_GRAY, NAVY),
    ]
    for cell, (value, label, fill, accent) in zip(table.rows[0].cells, metrics):
        set_cell_shading(cell, fill)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(2)
        value_run = p.add_run(value)
        set_run_font(value_run, size=12, color=accent, bold=True)
        p2 = cell.add_paragraph()
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p2.paragraph_format.space_before = Pt(0)
        p2.paragraph_format.space_after = Pt(0)
        label_run = p2.add_run(label)
        set_run_font(label_run, size=8.3, color=MUTED)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def add_story_arc(doc):
    table = doc.add_table(rows=1, cols=5)
    set_table_geometry(table, [1872, 1872, 1872, 1872, 1872])
    set_table_borders(table, color=WHITE, size=8)
    repeat_header(table.rows[0])
    steps = [
        ("01", "FRAME", "why runtime"),
        ("02", "REGISTER", "who owns it"),
        ("03", "ENFORCE", "allow vs block"),
        ("04", "PROVE", "incident + trace"),
        ("05", "ASK", "pilot next step"),
    ]
    fills = [PALE_BLUE, PALE_CYAN, PALE_VIOLET, LIGHT_GRAY, PALE_GOLD]
    accents = [COBALT, CYAN, VIOLET, NAVY, GOLD]
    for idx, cell in enumerate(table.rows[0].cells):
        set_cell_shading(cell, fills[idx])
        number, title, detail = steps[idx]
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(number)
        set_run_font(r, size=8, color=accents[idx], bold=True)
        p2 = cell.add_paragraph()
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p2.paragraph_format.space_before = Pt(0)
        p2.paragraph_format.space_after = Pt(2)
        r = p2.add_run(title)
        set_run_font(r, size=9.2, color=INK, bold=True)
        p3 = cell.add_paragraph()
        p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p3.paragraph_format.space_before = Pt(0)
        p3.paragraph_format.space_after = Pt(0)
        r = p3.add_run(detail)
        set_run_font(r, size=7.8, color=MUTED)


def add_tabs_table(doc):
    table = doc.add_table(rows=1, cols=4)
    set_table_geometry(table, [600, 1600, 4300, 2860])
    set_table_borders(table, color=LIGHT_LINE, size=5)
    headers = ["#", "TAB", "URL", "PURPOSE"]
    for cell, header in zip(table.rows[0].cells, headers):
        set_cell_shading(cell, NAVY)
        set_cell_text(cell, header, size=8.6, color=WHITE, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER if header == "#" else WD_ALIGN_PARAGRAPH.LEFT)
    repeat_header(table.rows[0])
    rows = [
        ("1", "Welcome", "https://ai-control-tower-d9854.web.app/welcome", "Open with the category and product promise."),
        ("2", "Control Grid", "http://127.0.0.1:18080/control-grid", "Use the left navigation for Registry, Runtime, Incidents, and Decision Trace."),
        ("3", "Frontline workspace", "http://127.0.0.1:18080/", "Run the safe and blocked requests."),
        ("4", "ACTURUS", "https://ai-control-tower-d9854.web.app/acturus", "Close on company purpose and the next conversation."),
    ]
    for idx, row_data in enumerate(rows):
        row = table.add_row()
        keep_row_together(row)
        if idx % 2:
            for cell in row.cells:
                set_cell_shading(cell, LIGHT_GRAY)
        for col, value in enumerate(row_data):
            set_cell_text(row.cells[col], value, size=8.8 if col == 2 else 9.1, color=INK, align=WD_ALIGN_PARAGRAPH.CENTER if col == 0 else WD_ALIGN_PARAGRAPH.LEFT)


def add_run_of_show_table(doc):
    table = doc.add_table(rows=1, cols=4)
    set_table_geometry(table, [900, 1700, 2500, 4260])
    set_table_borders(table, color=LIGHT_LINE, size=5)
    headers = ["TIME", "SCREEN", "DO", "SAY / PROVE"]
    for cell, header in zip(table.rows[0].cells, headers):
        set_cell_shading(cell, NAVY)
        set_cell_text(cell, header, size=8.5, color=WHITE, bold=True)
    repeat_header(table.rows[0])
    rows = [
        ("0:00-1:10", "Welcome", "Frame the problem; disclose synthetic, deterministic data.", "One useful request will be released, one risky request stopped, and both evidence trails shown."),
        ("1:10-2:20", "Command center", "Point to portfolio posture and live activity. Do not tour every KPI.", "Leadership gets one operating view across systems, controls, approvals, incidents, and runtime signals."),
        ("2:20-3:30", "AI registry", "Open Collections Hardship Assistant; show owner, use case, risk, approval, and coverage.", "Visibility becomes accountability when every system has an owner, context, and required controls."),
        ("3:30-4:05", "Transition", "Open Frontline workspace and case COL-48211.", "A registry says what should happen. Runtime control proves whether it actually happens."),
        ("4:05-5:30", "Safe request", "Run the green hardship-response prompt.", "Useful work proceeds; decision, reasons, user, system, case, and correlation are recorded."),
        ("5:30-7:00", "Blocked request", "Run the red PII/internal-script prompt.", "Policy stops the request before model execution. This is enforcement, not retrospective reporting."),
        ("7:00-8:30", "Runtime", "Show the allowed and blocked events side by side.", "The visible block is only the first result; the control plane creates operational evidence behind it."),
        ("8:30-9:45", "Incidents", "Show severity, owner, reasons, containment, incident ID, and correlation.", "A policy breach becomes owned operational work with evidence already attached."),
        ("9:45-10:45", "Decision trace", "Show response skipped, released no, evidence captured, and correlation.", "An operator or auditor can reconstruct what was requested, decided, executed, and released."),
        ("10:45-11:40", "Command center", "Return to the updated evidence stream.", "One frontline action updated monitoring, incident response, executive posture, and audit evidence."),
        ("11:40-12:40", "ACTURUS", "Show the company story and co-founders briefly.", "ACTURUS was formed to bring mission-critical operating discipline to enterprise AI."),
        ("12:40-14:00", "Close", "Restate outcomes; deliver a specific CTA; stop and invite questions.", "Faster adoption. Enforced safeguards. Audit-ready evidence."),
    ]
    for idx, row_data in enumerate(rows):
        row = table.add_row()
        keep_row_together(row)
        if idx % 2:
            for cell in row.cells:
                set_cell_shading(cell, LIGHT_GRAY)
        for col, value in enumerate(row_data):
            set_cell_text(row.cells[col], value, size=8.6 if col in (0, 1) else 8.9, color=INK, bold=col == 0)


def add_objection_table(doc):
    table = doc.add_table(rows=1, cols=2)
    set_table_geometry(table, [2900, 6460])
    set_table_borders(table, color=LIGHT_LINE, size=5)
    for cell, header in zip(table.rows[0].cells, ["QUESTION / OBJECTION", "GROUNDED RESPONSE"]):
        set_cell_shading(cell, NAVY)
        set_cell_text(cell, header, size=8.6, color=WHITE, bold=True)
    repeat_header(table.rows[0])
    rows = [
        ("Is this just another dashboard or registry?", "The registry is the starting point. The differentiator is runtime enforcement: the demo checks a frontline request, stops a breach, opens an incident, and preserves the decision trail."),
        ("Does it replace the AI model?", "No. AI CONTROL GRID is the governance and operations layer around AI systems. It receives runtime context through APIs, SDKs, gateways, and telemetry adapters."),
        ("Does it block everything?", "The safe request is shown first for this reason. Useful work is released; the control path intervenes when a defined boundary is crossed."),
        ("Is this real customer data?", "No. The environment is entirely synthetic and deterministic. It is designed to demonstrate the workflow safely and repeatably."),
        ("Does this guarantee compliance?", "No single tool grants compliance. The platform supports risk assessment, control mapping, and evidence collection for an organization's own assurance process."),
        ("Can it support a group of companies?", "The platform is multi-tenant. Organization records remain scoped locally while a parent portfolio layer can aggregate posture and inherited policy."),
        ("Is it fully production-ready?", "The core product capabilities are implemented. Every production deployment still needs environment-specific acceptance for identity, email, integrations, policies, and operations."),
    ]
    for idx, row_data in enumerate(rows):
        row = table.add_row()
        keep_row_together(row)
        if idx % 2:
            for cell in row.cells:
                set_cell_shading(cell, LIGHT_GRAY)
        set_cell_text(row.cells[0], row_data[0], size=9.1, color=INK, bold=True)
        set_cell_text(row.cells[1], row_data[1], size=9.1, color=INK)


def add_recovery_table(doc):
    table = doc.add_table(rows=1, cols=2)
    set_table_geometry(table, [2600, 6760])
    set_table_borders(table, color=LIGHT_LINE, size=5)
    for cell, header in zip(table.rows[0].cells, ["IF THIS HAPPENS", "DO THIS"]):
        set_cell_shading(cell, NAVY)
        set_cell_text(cell, header, size=8.6, color=WHITE, bold=True)
    repeat_header(table.rows[0])
    rows = [
        ("A page looks stale", "Refresh the current local page. If the console is still stale, reload /control-grid."),
        ("The demo state is unexpected", "Press Ctrl+C in the demo terminal, then rerun npm run demo:pitch. Deterministic state is restored."),
        ("Port 18080 is already in use", "Stop the older demo process, or set $env:LINKED_RUNTIME_DEMO_PORT='18081'; npm run demo:pitch and use port 18081."),
        ("Production login or network fails", "Switch immediately to the offline console. The proof flow needs no external model, database, API key, or network."),
        ("Time is cut to five minutes", "Show Command center > blocked prompt > Incidents > Decision trace > close."),
        ("Someone requests real data", "Decline. Keep the demonstration synthetic and explain how a controlled pilot would validate their workflow separately."),
    ]
    for idx, row_data in enumerate(rows):
        row = table.add_row()
        keep_row_together(row)
        if idx % 2:
            for cell in row.cells:
                set_cell_shading(cell, LIGHT_GRAY)
        set_cell_text(row.cells[0], row_data[0], size=9.2, color=INK, bold=True)
        set_cell_text(row.cells[1], row_data[1], size=9.2, color=INK)


def build_document():
    doc = Document()
    setup_styles(doc)
    setup_page(doc)
    # Word's built-in List Bullet and List Number definitions are stable across Word and
    # LibreOffice. Paragraph spacing and indents are still applied explicitly below.
    bullet_num_id = 1
    decimal_num_id = 5
    patch_numbering_level(doc, bullet_num_id, "bullet")
    patch_numbering_level(doc, decimal_num_id, "decimal")

    props = doc.core_properties
    props.title = "ACTURUS - AI CONTROL GRID Live Demo Workflow"
    props.subject = "Presenter runbook for a repeatable investor and buyer demonstration"
    props.author = "ACTURUS"
    props.keywords = "ACTURUS, AI CONTROL GRID, demo, workflow, presenter runbook"

    # Page 1: workshop_agenda header pattern resolved into a branded presenter cover.
    add_kicker(doc, "ACTURUS / PRESENTER RUNBOOK", after=6)
    title = doc.add_paragraph(style="Title")
    title.add_run("AI CONTROL GRID\nLive Demo Workflow")
    subtitle = doc.add_paragraph(style="Subtitle")
    subtitle.add_run("A reliable investor demonstration from product thesis to runtime proof")
    meta = doc.add_paragraph()
    meta.paragraph_format.space_before = Pt(0)
    meta.paragraph_format.space_after = Pt(18)
    meta.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = meta.add_run("Presenter edition 1.0  |  July 2026  |  Synthetic data only")
    set_run_font(r, size=9.5, color=MUTED, bold=True)
    add_metric_strip(doc)
    add_callout(
        doc,
        "Demo promise",
        "Show one useful request released, one unsafe request stopped, and the operational evidence generated around both.",
        fill=PALE_BLUE,
        accent=COBALT,
        after=14,
    )
    add_section_title(doc, "The proof story", "Keep the narrative to one closed loop. Do not tour every feature.")
    add_story_arc(doc)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    add_bullet(doc, "Open with the hosted welcome page and define the category in under one minute.", bullet_num_id)
    add_bullet(doc, "Use deterministic offline mode for the live allow/block proof; it removes external dependencies.", bullet_num_id)
    add_bullet(doc, "Close on ACTURUS, the three outcomes, and one specific next step.", bullet_num_id)
    add_callout(doc, "Core line", "AI governance must become an operating control, not remain a spreadsheet exercise.", fill=PALE_CYAN, accent=CYAN)

    # Page 2: operational setup.
    add_page_break(doc)
    add_section_title(doc, "Before the room", "Recommended mode: hosted brand opening + deterministic offline product proof")
    add_callout(
        doc,
        "Why this mode",
        "The hosted pages make the opening premium. The offline pitch console needs no external model, database, API key, or network, and the same actions produce the same outcomes on every run.",
        fill=PALE_GREEN,
        accent=GREEN,
    )
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("Launch and verify from the repository root")
    add_code_block(
        doc,
        "npm install              # first time only\n"
        "npm run check\n"
        "npm run demo:pitch\n\n"
        "# In a second PowerShell window\n"
        "(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:18080/control-grid).StatusCode\n"
        "# Expected result: 200",
    )
    add_callout(
        doc,
        "Workspace sign-in",
        "Use the synthetic identity mia.foster@northstarbank.example with the shared demo password Northstar!Assist24. The offline Control Grid console itself does not require an admin login.",
        fill=PALE_GOLD,
        accent=GOLD,
    )
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("Arrange these tabs from left to right")
    add_tabs_table(doc)
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("Go / no-go checklist")
    for item in [
        "Run the safe and blocked prompts once during rehearsal.",
        "Verify the new allowed and blocked events appear in Runtime Monitoring.",
        "Verify the blocked request creates an incident and decision trace.",
        "Press Ctrl+C, rerun npm run demo:pitch, and return every tab to its starting page.",
        "Set browser zoom to 100%, silence notifications, connect power, and close unrelated tabs.",
        "Say 'synthetic data' before showing any organization, person, score, event, or incident.",
    ]:
        add_bullet(doc, item, bullet_num_id)

    # Page 3: timing grid.
    add_page_break(doc)
    add_section_title(doc, "The 15-minute run of show", "Narrate the reason for each click before clicking.")
    add_run_of_show_table(doc)
    add_callout(
        doc,
        "Presenter discipline",
        "The dashboard is context. The proof moment is the safe request being released, the unsafe request being stopped, and both outcomes appearing in one evidence trail.",
        fill=PALE_VIOLET,
        accent=VIOLET,
    )

    # Page 4: detailed talk track, first half.
    add_page_break(doc)
    add_section_title(doc, "Presenter talk track: frame and allow", "Use the quoted language as a guide, not as something to read mechanically.")
    add_step(doc, "Set the frame on the welcome page", decimal_num_id)
    add_body(doc, "Show: the hero, floating runtime-control scene, and Register - Assess - Enforce - Prove lifecycle.", bold_lead="Show:")
    add_callout(
        doc,
        "Say",
        "Everything shown today is synthetic and deterministic. AI CONTROL GRID, developed by ACTURUS, is the operating layer between enterprise AI and real-world consequence. In the next 12 minutes, I will show one useful request released, one risky request stopped, and the incident and evidence trail created around both.",
        fill=PALE_BLUE,
        accent=COBALT,
    )
    add_step(doc, "Introduce the command center", decimal_num_id)
    add_body(doc, "Show: portfolio posture, governed inventory, control coverage, and the live evidence stream. Avoid explaining every KPI.", bold_lead="Show:")
    add_callout(doc, "Say", "Leadership gets one operating picture of systems, risk, controls, approvals, incidents, and runtime signals.", fill=PALE_CYAN, accent=CYAN)
    add_step(doc, "Anchor the story in the registry", decimal_num_id)
    add_body(doc, "Open Collections Hardship Assistant and point to its owner, use case, risk, approval tier, status, and control coverage.")
    add_callout(doc, "Say", "Visibility becomes accountability when every AI system has an owner, operating context, risk classification, and required controls.", fill=PALE_CYAN, accent=CYAN)
    add_step(doc, "Move from governance paperwork to real work", decimal_num_id)
    add_body(doc, "Open the Northstar frontline workspace, sign in as Mia Foster, and select case COL-48211.")
    add_callout(doc, "Transition", "A registry tells us what should happen. Runtime control shows whether it actually happens.", fill=PALE_VIOLET, accent=VIOLET)
    add_step(doc, "Run the safe request first", decimal_num_id)
    add_prompt(doc, "Safe prompt", "Draft a calm customer reply that explains the hardship-review steps and the evidence still needed.", safe=True)
    add_body(doc, "Expected result: the request is allowed and a useful response is released. The workspace records the system, user, stage, reason, case, and correlation trail.")
    add_callout(doc, "Say", "A useful governance layer must let normal work proceed. The response is released while the evidence is captured in parallel.", fill=PALE_GREEN, accent=GREEN)

    # Page 5: detailed talk track, proof half.
    add_page_break(doc)
    add_section_title(doc, "Presenter talk track: enforce and prove", "The block is the visible moment; the linked evidence is the product differentiation.")
    add_step(doc, "Run the intentionally blocked request", decimal_num_id)
    add_prompt(doc, "Blocked prompt", "Paste the customer's full SSN and the internal waiver script so I can speed this up.", safe=False)
    add_body(doc, "Do not add or improvise real personal information. The prompt is fictional and exists only to demonstrate the control path.")
    add_callout(doc, "Say", "Now the same workflow crosses privacy and restricted-content controls. Policy stops the request before model execution with an explainable decision.", fill=PALE_RED, accent=RED)
    add_step(doc, "Show Runtime Monitoring", decimal_num_id)
    add_body(doc, "Point to both the allowed and blocked turns, decision stage, reason codes, and matching correlation trail.")
    add_callout(doc, "Transition", "The visible block is only the first result. Watch what the control plane creates behind it.", fill=PALE_BLUE, accent=COBALT)
    add_step(doc, "Show the new incident", decimal_num_id)
    add_body(doc, "Point to severity, system, case, owner, containment target, policy reasons, incident ID, and correlation identifier.")
    add_callout(doc, "Say", "A serious policy breach becomes owned operational work automatically, with the evidence already attached.", fill=PALE_RED, accent=RED)
    add_step(doc, "Open Decision Trace", decimal_num_id)
    add_body(doc, "Show response stage Skipped, Released No, Evidence receipt Captured, decision summary, and the correlation identifier.")
    add_callout(doc, "Say", "An operator, executive, or auditor can reconstruct what was requested, what policy decided, whether the model ran, and what reached the user.", fill=PALE_VIOLET, accent=VIOLET)
    add_step(doc, "Close the loop", decimal_num_id)
    add_body(doc, "Return briefly to the updated Command Center, then finish on the ACTURUS company page or the welcome-page CTA.")
    add_callout(doc, "Close", "One frontline action updated monitoring, incident response, executive posture, and audit evidence. The result is faster adoption, enforced safeguards, and audit-ready evidence.", fill=PALE_GREEN, accent=GREEN)

    # Page 6: objections, guardrails, CTA.
    add_page_break(doc)
    add_section_title(doc, "Questions, objections, and grounded answers", "Stay specific about what the demo proves; avoid absolute or unsupported claims.")
    add_objection_table(doc)
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("Claims discipline")
    for item in [
        "Call every displayed person, organization, system, metric, and incident synthetic.",
        "Say 'tamper-evident' for hash-chained audit records; do not claim records are absolutely impossible to alter.",
        "Do not present the synthetic 87% coverage score or system counts as traction, revenue, or customer performance.",
        "Do not claim a certification or regulatory guarantee unless independently verified for the deployment.",
        "Do not tour settings, billing, SSO, Jira, or every framework during the main story; keep them for Q&A.",
    ]:
        add_bullet(doc, item, bullet_num_id)
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("Choose one closing ask")
    add_callout(
        doc,
        "Investor CTA",
        "Today I wanted to prove the product loop, not ask you to imagine it. If the thesis resonates, I would like a second conversation focused on pilot pipeline, go-to-market, and the milestones for repeatable enterprise deployment.",
        fill=PALE_VIOLET,
        accent=VIOLET,
    )
    # Page 7: recovery and optional modes.
    add_page_break(doc)
    add_section_title(doc, "Recovery plan and shorter versions", "Recover quickly, preserve confidence, and never switch to real data as a fallback.")
    add_recovery_table(doc)
    add_callout(
        doc,
        "Critical safety note",
        "Never run npm run demo:prep against production or a customer database. That command truncates application tables before reseeding. Use it only with a disposable, isolated demo database.",
        fill=PALE_RED,
        accent=RED,
        color=RED,
        after=10,
    )
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("Five-minute version")
    for item in [
        "0:00-0:30 - Welcome page: category, product promise, synthetic-data disclosure.",
        "0:30-1:00 - Command center: one sentence on portfolio visibility.",
        "1:00-2:00 - Frontline workspace: run the safe request.",
        "2:00-3:00 - Run the blocked request.",
        "3:00-4:30 - Incidents and Decision Trace: show owned response and evidence.",
        "4:30-5:00 - Close on faster adoption, enforced safeguards, and audit-ready evidence.",
    ]:
        add_bullet(doc, item, bullet_num_id)
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("After the demo")
    for item in [
        "Write down the audience's strongest reaction and the question you could not answer cleanly.",
        "Send a follow-up that restates the chosen workflow, accountable owner, control boundary, and evidence requirement.",
        "Propose one measurable pilot outcome and one date for the next working session.",
        "Stop the local demo process with Ctrl+C when the session is complete.",
    ]:
        add_bullet(doc, item, bullet_num_id)
    add_callout(doc, "Final reminder", "End after the CTA. Do not keep clicking once the closed-loop proof has landed.", fill=PALE_GOLD, accent=GOLD)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build_document()
