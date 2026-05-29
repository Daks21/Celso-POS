const receiptModal = document.getElementById("receipt-modal");
const receiptNumber = document.getElementById("receipt-number");
const receiptDate = document.getElementById("receipt-date");
const receiptTime = document.getElementById("receipt-time");
const receiptCashier = document.getElementById("receipt-cashier");
const receiptItemsBody = document.getElementById("receipt-items-body");

const receiptSubtotal = document.getElementById("receipt-subtotal");
const receiptGrandTotal = document.getElementById("receipt-grand-total");
const receiptPayment = document.getElementById("receipt-payment");
const receiptChange = document.getElementById("receipt-change");

const printReceiptButton = document.getElementById("print-receipt-button");
const closeReceiptButton = document.getElementById("close-receipt-button");

if (printReceiptButton) {
  printReceiptButton.addEventListener("click", function () {
    window.print();
  });
}

if (closeReceiptButton) {
  closeReceiptButton.addEventListener("click", function () {
    closeReceiptModal();
  });
}

receiptModal.addEventListener("click", function (event) {
  if (event.target === receiptModal) {
    closeReceiptModal();
  }
});

function showReceipt(sale) {
  receiptNumber.textContent = sale.receiptNo || `RCPT-${sale.id}`;
  receiptDate.textContent = formatDateTz(sale.timestamp);
  receiptTime.textContent = formatTimeTz(sale.timestamp);
  receiptCashier.textContent = sale.cashier;

  receiptItemsBody.innerHTML = "";

  sale.items.forEach(function (item) {
    const row = document.createElement("tr");
    [item.name, String(item.quantity), formatPeso(item.price), formatPeso(item.lineTotal)]
      .forEach(function (text) {
        const td = document.createElement("td");
        td.textContent = text;
        row.appendChild(td);
      });
    receiptItemsBody.appendChild(row);
  });

  receiptSubtotal.textContent = formatPeso(sale.subtotal);

  const receiptTaxRow    = document.getElementById('receipt-tax-row');
  const receiptTaxAmount = document.getElementById('receipt-tax-amount');
  if (receiptTaxRow && receiptTaxAmount) {
    if (sale.tax > 0) {
      receiptTaxAmount.textContent = formatPeso(sale.tax);
      receiptTaxRow.style.display  = '';
    } else {
      receiptTaxRow.style.display = 'none';
    }
  }

  receiptGrandTotal.textContent = formatPeso(sale.total);
  receiptPayment.textContent = formatPeso(sale.payment);
  receiptChange.textContent = formatPeso(sale.change);

  receiptModal.style.display = "flex";
}

function closeReceiptModal() {
  receiptModal.style.display = "none";
}
