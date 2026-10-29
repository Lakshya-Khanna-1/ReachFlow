import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("fixtures", { recursive: true });
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  book,
  XLSX.utils.aoa_to_sheet([
    ["Prospect export"],
    [" E-mail ", "Full Name", "Company", "Role"],
    [" Ada@Example.com ", "Ada", "Analytical", "Founder"],
    ["", "", "", ""],
    ["ada@example.com", "Duplicate", "Analytical", ""],
    ["broken", "Bad", "", ""],
    ["known@example.com", "Known", "", ""],
    ["grace@example.com", "Grace", "Compiler Co", "Engineer"],
  ]),
  "Founders",
);
XLSX.utils.book_append_sheet(
  book,
  XLSX.utils.aoa_to_sheet([
    ["contact email", "Person", "Business", "Notes"],
    ["alan@example.com", "Alan", "Computing", "Interested in automation"],
  ]),
  "Partners",
);
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Empty");
writeFileSync("fixtures/messy-leads.xlsx", XLSX.write(book,{type:"buffer",bookType:"xlsx"}));
