export const styles = {
  page: {
    fontFamily:
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    backgroundColor: "#f5f7fb",
    padding: "32px 16px",
  },

  container: {
    maxWidth: "700px",
    margin: "0 auto",
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "32px",
  },

  jobCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "20px",
    marginBottom: "16px",
  },

  button: {
    display: "inline-block",
    backgroundColor: "#111827",
    color: "#fff",
    textDecoration: "none",
    padding: "10px 18px",
    borderRadius: "8px",
    fontWeight: 600,
  },
} as const;