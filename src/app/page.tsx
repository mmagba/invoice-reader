"use client";

import { useState, useRef, useEffect, ChangeEvent } from 'react';

// Define the structure for the extracted data
interface ExtractedInvoiceData {
  fileName: string;
  invoiceNumber: string;
  companyNumber: string;
  date: string;
  totalAmount: string;
}

// To inform TypeScript that XLSX will be available globally from the script tag
type SheetDataRow = Record<string, string>;

interface Worksheet {
  [key: string]: unknown;
}

type Workbook = object;

interface XLSXType {
  utils: {
    json_to_sheet: (data: SheetDataRow[]) => Worksheet;
    book_new: () => Workbook;
    book_append_sheet: (workbook: Workbook, worksheet: Worksheet, name: string) => void;
  };
  writeFile: (workbook: Workbook, filename: string) => void;
}

declare const XLSX: XLSXType;


// Ensure invoice numbers contain digits only
const sanitizeInvoiceNumber = (raw: string): string => {
  const digitsOnly = (raw || '').replace(/\D+/g, '');
  return digitsOnly;
};


// Loader Component
const Loader = (): React.ReactElement => (
  <div className="flex justify-center items-center py-8">
    <style jsx>{`
            .loader {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `}</style>
    <div className="loader"></div>
    <p className="ml-4 text-gray-600">Analyzing invoices with AI... This may take a moment.</p>
  </div>
);

export default function Home(): React.ReactElement {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamically load the xlsx library from a CDN
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // Clean up the script when the component unmounts
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);


  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      setSelectedFiles(files);
    }
  };

  const resetUI = () => {
    setError('');
    setExtractedData([]);
    setIsLoading(true);
  };

  const processInvoices = async () => {
    if (selectedFiles.length === 0) {
      setError("No files selected.");
      return;
    }

    resetUI();

    const processingPromises = selectedFiles.map(file => {
      return new Promise<ExtractedInvoiceData>((resolve) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64ImageData = (event.target?.result as string)?.split(',')[1];
          if (base64ImageData) {
            try {
              const data = await extractInvoiceData(base64ImageData);
              resolve({ fileName: file.name, ...data });
            } catch (err) {
              console.error(`Error processing ${file.name}:`, err);
              resolve({ fileName: file.name, invoiceNumber: 'Error', companyNumber: 'Error', date: 'Error', totalAmount: 'Error' });
            }
          } else {
            resolve({ fileName: file.name, invoiceNumber: 'Error', companyNumber: 'Error', date: 'Error', totalAmount: 'Error' });
          }
        };
        reader.onerror = () => {
          resolve({ fileName: file.name, invoiceNumber: 'Error', companyNumber: 'Error', date: 'Error', totalAmount: 'Error' });
        };
        reader.readAsDataURL(file);
      });
    });

    try {
      const results = await Promise.all(processingPromises);
      const sanitizedResults = results.map(r => ({
        ...r,
        invoiceNumber: sanitizeInvoiceNumber(r.invoiceNumber)
      }));
      setExtractedData(sanitizedResults);
    } catch (err) {
      console.error("An error occurred during batch processing:", err);
      setError("A critical error occurred while processing files. Please check the console.");
    } finally {
      setIsLoading(false);
    }
  };

  const extractInvoiceData = async (base64ImageData: string): Promise<Omit<ExtractedInvoiceData, 'fileName'>> => {
    const prompt = `You are analyzing an invoice image. Return ONLY a strict JSON object with keys: "invoiceNumber", "companyNumber", "totalAmount", "date".

Hard requirement for companyNumber:
- Extract the registration/tax number of the ISSUER (seller/vendor/supplier) of the invoice.
- NEVER return the buyer/recipient/customer/client number, even if it is more prominent.
- If unsure whether a number belongs to the issuer or the buyer, return "N/A" for companyNumber.

Issuer vs buyer disambiguation:
- ISSUER cues (use these): "From", "Supplier", "Vendor", "Seller", "Issued by", company name/logo/address in the header.
- BUYER cues (avoid these): "Bill To", "Invoice To", "Ship To", "Customer", "Client", "Sold To", "Deliver To".
- Registration labels you may see: ABN, ACN, VAT, GST, Company No., Registration No., Reg No., Tax ID, TIN, UTR, CIF, SIREN, SIRET, etc. Prefer the one nearest the ISSUER name/address section.
- If both issuer and buyer numbers appear, ALWAYS choose the ISSUER’s number.

Other fields:
- totalAmount: choose the grand total / amount due ("Total", "Amount Due", "Balance Due").
- invoiceNumber: values near "Invoice", "Invoice No", "Invoice #".
- date: primary invoice issue date near the invoice header; prefer issue date over due date when ambiguous.

Output format:
- If any value is missing, set it to "N/A".
- Output must be ONLY JSON with these exact keys.

Examples (for guidance only):
Example A (CORRECT — issuer number):
Image text contains:
  From: Alpha Pty Ltd (ABN 12 345 678 901)
  Bill To: Beta Pty Ltd (ABN 98 765 432 109)
  Total: $1,234.50  Invoice #: INV-1001  Date: 12/03/2024
Return:
  {"invoiceNumber":"INV-1001","companyNumber":"ABN 12 345 678 901","totalAmount":"$1,234.50","date":"12/03/2024"}

Example B (If unsure, use N/A for companyNumber):
Image text contains only: "Bill To: Gamma Ltd (VAT GB123456789)"
Return:
  {"invoiceNumber":"N/A","companyNumber":"N/A","totalAmount":"N/A","date":"N/A"}`;

    // Call server-side API route to keep API key secret
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64ImageData, prompt })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server extraction failed: ${errText}`);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];
    if (candidate?.content?.parts?.[0]?.text) {
      return JSON.parse(candidate.content.parts[0].text);
    }
    throw new Error('No structured result from model');
  };

  const downloadExcel = () => {
    if (typeof XLSX === 'undefined') {
      setError("Excel library is still loading. Please try again in a moment.");
      return;
    }

    if (extractedData.length === 0) {
      setError("No data to export.");
      return;
    }

    const sheetData = extractedData.map(item => ({
      'Invoice Number': item.invoiceNumber,
      'Company Number': item.companyNumber,
      'Date': item.date,
      'Total Amount': item.totalAmount,
      'Source File': item.fileName
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');

    const max_width = sheetData.reduce((w, r) => Math.max(w, (r['Source File'] || '').length), 10);
    worksheet["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: max_width }];

    XLSX.writeFile(workbook, 'InvoiceData.xlsx');
  };

  return (
    <main className="bg-gray-50 text-gray-800 min-h-screen">
      <div className="container mx-auto p-4 md:p-8 max-w-4xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Invoice Data Extractor</h1>
          <p className="text-md text-gray-600 mt-2">Upload invoice images, extract key info with AI, and export to Excel.</p>
        </header>

        {/* File Upload Section */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
          <h2 className="text-xl font-semibold mb-4">1. Upload Invoices</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelection}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300"
            >
              Select Invoice Images
            </button>
            <p className="text-gray-500 mt-4 text-sm">
              {selectedFiles.length > 0
                ? `${selectedFiles.length} file(s) selected.`
                : 'Select one or more invoice files (PNG, JPG, etc.)'}
            </p>
          </div>
          <div className="text-center mt-4">
            <button
              onClick={processInvoices}
              className="bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition w-full md:w-auto disabled:bg-gray-400 disabled:cursor-not-allowed"
              disabled={selectedFiles.length === 0 || isLoading}
            >
              {isLoading ? 'Processing...' : 'Extract Data from Invoices'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {(isLoading || extractedData.length > 0 || error) && (
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">2. Extracted Data</h2>
              <button
                onClick={downloadExcel}
                className="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={extractedData.length === 0}
              >
                Download Excel
              </button>
            </div>

            {isLoading && <Loader />}

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            )}

            {!isLoading && extractedData.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Number</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company Number</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {extractedData.map((data, index) => (
                      <tr key={index}>
                        <td className="py-3 px-4 text-sm text-gray-700 font-medium">{data.fileName || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{data.invoiceNumber || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{data.companyNumber || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{data.date || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{data.totalAmount || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoading && extractedData.length === 0 && !error && (
              <p className="text-center text-gray-500 py-8">No data extracted yet. Please upload and process invoices.</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

