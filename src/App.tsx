import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();

function App() {
  const [customers, setCustomers] = useState<Array<Schema["Customer"]["type"]>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    try {
      const { data } = await client.models.Customer.list();
      setCustomers(data as Schema["Customer"]["type"][]);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  }

  function createCustomer() {
    const name = window.prompt("Customer name");
    const email = window.prompt("Customer email");
    if (name && email) {
      client.models.Customer.create({
        name,
        email,
        status: "active",
        billingRatePerHour: 50,
      });
      fetchCustomers();
    }
  }

  return (
    <main>
      <h1>Delivery Management System</h1>
      <h2>Customers</h2>
      <button onClick={createCustomer}>+ Add Customer</button>
      {loading ? (
        <p>Loading customers...</p>
      ) : (
        <ul>
          {customers.map((customer) => (
            <li key={customer.id}>{customer.name} ({customer.email})</li>
          ))}
        </ul>
      )}
      <div>
        🥳 App successfully hosted. Try adding a new customer.
        <br />
        <a href="https://docs.amplify.aws/react/start/quickstart/#make-frontend-updates">
          Review next step of this tutorial.
        </a>
      </div>
    </main>
  );
}

export default App;
