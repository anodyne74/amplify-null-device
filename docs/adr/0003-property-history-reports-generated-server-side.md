# Property History Reports are generated server-side, unlike invoice PDFs

Status: proposed

Invoice PDFs are built in the browser with jsPDF and uploaded, so a new reader will expect Property History Reports to work the same way. They don't. A report is an audit record handed to agents, so the server (an API route that checks the caller's group and Customer scope, per ADR 0001) runs the search itself, renders the PDF, writes it under a locked-down `reports/{customerId}/` S3 path, and creates the report record. If the browser built the PDF, a user could upload any content as "the audit trail", and the report's scope would depend on client-side filtering. The browser only sends the search and filters.
