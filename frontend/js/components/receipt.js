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
  const saleDate = new Date(sale.timestamp);

  receiptNumber.textContent = sale.receiptNo || `RCPT-${sale.id}`;
  receiptDate.textContent = saleDate.toLocaleDateString("en-PH");
  receiptTime.textContent = saleDate.toLocaleTimeString("en-PH");
  receiptCashier.textContent = sale.cashier;

  receiptItemsBody.innerHTML = "";

  sale.items.forEach(function (item) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${formatPeso(item.price)}</td>
      <td>${formatPeso(item.lineTotal)}</td>
    `;

    receiptItemsBody.appendChild(row);
  });

  receiptSubtotal.textContent = formatPeso(sale.subtotal);
  receiptGrandTotal.textContent = formatPeso(sale.total);
  receiptPayment.textContent = formatPeso(sale.payment);
  receiptChange.textContent = formatPeso(sale.change);

  receiptModal.style.display = "flex";
}

function closeReceiptModal() {
  receiptModal.style.display = "none";
}
