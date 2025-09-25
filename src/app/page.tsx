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
  <div className="flex flex-col items-center justify-center py-12">
    <div className="relative">
      {/* Outer ring */}
      <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
      {/* Inner spinning ring */}
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-blue-500 border-r-purple-500 rounded-full animate-spin"></div>
      {/* Center dot */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></div>
    </div>
    
    <div className="mt-6 text-center">
      <h3 className="text-lg font-semibold text-slate-700 mb-2">Analyzing Invoices with AI</h3>
      <p className="text-slate-500 mb-4">This may take a moment while we process your files...</p>
      
      {/* Progress dots */}
      <div className="flex justify-center space-x-2">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
        <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
      </div>
    </div>
  </div>
);

export default function Home(): React.ReactElement {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsSectionRef = useRef<HTMLDivElement>(null);

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
    if (event.target.files && event.target.files.length > 0) {
      const newFiles = Array.from(event.target.files);
      
      // Check if adding these files would exceed the 10-file limit
      const totalFilesAfterAddition = selectedFiles.length + newFiles.length;
      if (totalFilesAfterAddition > 10) {
        setError(`Cannot add ${newFiles.length} file(s). Maximum of 10 files allowed. Currently have ${selectedFiles.length} files selected.`);
        event.target.value = '';
        return;
      }
      
      // Check for duplicates and add only new files
      const filesToAdd = newFiles.filter(newFile => 
        !selectedFiles.some(existingFile => 
          existingFile.name === newFile.name && existingFile.size === newFile.size
        )
      );
      
      if (filesToAdd.length > 0) {
        setSelectedFiles(prevFiles => [...prevFiles, ...filesToAdd]);
        // Clear any previous errors if files were added successfully
        setError('');
      }
      
      // Reset the input so the same files can be selected again if needed
      event.target.value = '';
    }
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    // Clear any error messages when files are removed
    setError('');
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
    
    // Scroll to results section immediately after clicking the button
    setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);

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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-40" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>
      
      <div className="relative container mx-auto p-6 md:p-12 max-w-6xl">
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-slate-900 via-blue-800 to-purple-800 bg-clip-text text-transparent mb-4">
            Invoice Data Extractor
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Upload invoice images, extract key information with AI, and export to Excel with professional precision.
          </p>
        </header>

        {/* Global Error Message */}
        {error && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 text-red-800 px-6 py-4 rounded-lg shadow-md relative mb-8" role="alert">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <strong className="font-semibold">Error: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            </div>
          </div>
        )}

        {/* File Upload Section */}
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-white/20 mb-8">
          <div className="flex items-center mb-6">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl mr-4 shadow-lg">
              <span className="text-white font-bold text-lg">1</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Upload Invoices</h2>
          </div>
          
          <div className="relative">
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center bg-gradient-to-br from-slate-50 to-blue-50/50 hover:from-blue-50 hover:to-indigo-50 transition-all duration-300 group">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileSelection}
              />
              
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Drop your invoice files here</h3>
                <p className="text-slate-500 mb-6">or click the button below to browse</p>
              </div>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-8 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                disabled={selectedFiles.length >= 10}
              >
                {selectedFiles.length >= 10 ? 'Maximum Files Reached' : 'Choose Invoice Images'}
              </button>
              
              <p className="text-slate-500 mt-6 text-sm">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length}/10 files selected.`
                  : 'Supports PNG, JPG, JPEG, and other image formats • Maximum 10 files'}
              </p>
            </div>
          </div>
          
          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center">
                <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Selected Files ({selectedFiles.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 rounded-xl border border-slate-200 hover:from-blue-50 hover:to-indigo-50 hover:border-blue-300 transition-all duration-300 group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start flex-1 min-w-0">
                        <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg mr-3 flex-shrink-0">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate" title={file.name}>{file.name}</p>
                          <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded-lg transition-all duration-200 ml-2 flex-shrink-0"
                        title="Remove file"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="text-center mt-8">
            <button
              onClick={processInvoices}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-4 px-8 rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 w-full md:w-auto disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center mx-auto"
              disabled={selectedFiles.length === 0 || isLoading}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Extract Data from Invoices
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {(isLoading || extractedData.length > 0 || error) && (
          <div ref={resultsSectionRef} className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-white/20">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center">
                <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl mr-4 shadow-lg">
                  <span className="text-white font-bold text-lg">2</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Extracted Data</h2>
              </div>
              <button
                onClick={downloadExcel}
                className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center"
                disabled={extractedData.length === 0}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Excel
              </button>
            </div>

            {isLoading && <Loader />}

            {!isLoading && extractedData.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="min-w-full bg-white">
                  <thead className="bg-gradient-to-r from-slate-50 to-blue-50">
                    <tr>
                      <th className="py-4 px-6 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Invoice</th>
                      <th className="py-4 px-6 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Invoice Number</th>
                      <th className="py-4 px-6 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Company Number</th>
                      <th className="py-4 px-6 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                      <th className="py-4 px-6 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {extractedData.map((data, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors duration-200">
                        <td className="py-4 px-6 text-sm text-slate-700 font-medium">{data.fileName || 'N/A'}</td>
                        <td className="py-4 px-6 text-sm text-slate-600">{data.invoiceNumber || 'N/A'}</td>
                        <td className="py-4 px-6 text-sm text-slate-600">{data.companyNumber || 'N/A'}</td>
                        <td className="py-4 px-6 text-sm text-slate-600">{data.date || 'N/A'}</td>
                        <td className="py-4 px-6 text-sm text-slate-600 font-medium">{data.totalAmount || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoading && extractedData.length === 0 && !error && (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-slate-500 text-lg">No data extracted yet. Please upload and process invoices.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

