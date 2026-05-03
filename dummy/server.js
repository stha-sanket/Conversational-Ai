const express = require("express");
const app = express();
const port = 3000;

// Dummy bank user data
const dummyUserData = {
  id: 1234,
  firstName: "Jane",
  lastName: "Doe",
  email: "jane.doe@example.com",
  phoneNumber: "+1-555-0198",
  address: "123 Main St, Springfield, IL 62701",
  isKYCverified: true,
  documentLink: "https://example.com/docs/kyc-1234.pdf",
  accounts: [
    {
      accountId: "CHK-987654321",
      accountType: "Checking",
      balance: 4500.5,
      currency: "USD",
      status: "Active",
    },
    {
      accountId: "SAV-123456789",
      accountType: "Savings",
      balance: 12500.0,
      currency: "USD",
      status: "Active",
    },
  ],
};

// Endpoint to return the single dummy data
app.post("/api/user/1234", (req, res) => {
  res.json(dummyUserData);
});

// Fallback for other users (optional, good for clarity)
app.post("/api/user/:id", (req, res) => {
  if (req.params.id === "1234") {
    res.json(dummyUserData);
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.listen(port, () => {
  console.log(`Dummy bank server listening at http://localhost:${port}`);
});
