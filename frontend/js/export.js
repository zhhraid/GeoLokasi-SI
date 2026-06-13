// Export PDF functionality
document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("export-report-button");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      exportReportToPDF();
    });
  }
});

async function exportReportToPDF() {
  try {
    // Show loading state
    const btn = document.getElementById("export-report-button");
    const originalText = btn?.textContent || "Export PDF";
    if (btn) btn.textContent = "Generating...";

    // Load libraries if needed
    await loadLibraries();

    // Generate PDF
    const element = document.querySelector(".dashboard-view") || document.querySelector("main");
    
    if (!element) {
      throw new Error("Content not found");
    }

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `AsalSI-Report-${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, logging: false, useCORS: true },
      jsPDF: { orientation: "portrait", unit: "mm", format: "a4" },
    };

    // Generate and save PDF
    await html2pdf().set(opt).from(element).save();

    // Restore button
    if (btn) btn.textContent = originalText;
    alert("PDF exported successfully!");
    
  } catch (error) {
    console.error("Error exporting PDF:", error);
    alert(`Gagal export PDF: ${error.message}`);
    const btn = document.getElementById("export-report-button");
    if (btn) btn.textContent = "Export PDF";
  }
}

async function loadLibraries() {
  return new Promise((resolve, reject) => {
    if (typeof html2pdf !== "undefined") {
      resolve();
      return;
    }

    // Load html2pdf
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load html2pdf library"));
    document.head.appendChild(script);
  });
}
