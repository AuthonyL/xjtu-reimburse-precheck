import { Document, Packer, Paragraph } from 'docx';

export const exampleDocx = (text: string) =>
  Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }));

export const exampleXml = (number: string, name = '合成器件') => `<EInvoice><EInvoiceData>
<SellerInformation><SellerName>合成电子公司</SellerName><SellerIdNum>SYNTHSELLER0000001</SellerIdNum></SellerInformation>
<BuyerInformation><BuyerName>合成大学</BuyerName><BuyerIdNum>SYNTHBUYER00000001</BuyerIdNum></BuyerInformation>
<BasicInformation><TotalTax-includedAmount>600</TotalTax-includedAmount></BasicInformation>
<IssuItemInformation><ItemName>*电子元件*${name}</ItemName><SpecMod>SYNTH-A</SpecMod><MeaUnits>个</MeaUnits><Quantity>2</Quantity><UnPrice>300</UnPrice><Amount>600</Amount><TaxRate>0</TaxRate><ComTaxAm>0</ComTaxAm></IssuItemInformation>
</EInvoiceData><TaxSupervisionInfo><InvoiceNumber>${number}</InvoiceNumber><IssueTime>2026-01-02</IssueTime></TaxSupervisionInfo></EInvoice>`;

export const exampleJpg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=',
  'base64',
);

export const examplePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
