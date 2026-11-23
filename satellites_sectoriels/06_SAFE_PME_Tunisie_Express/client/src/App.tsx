import { Route, Switch } from "wouter";
import { Shell } from "./components/Shell";
import Protected from "./_core/Protected";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Invoices, { NewInvoice } from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Bills from "./pages/Bills";
import Partners from "./pages/Partners";
import Products from "./pages/Products";
import Payroll from "./pages/Payroll";
import Employees from "./pages/Employees";
import Accounting from "./pages/Accounting";
import Vat from "./pages/Vat";
import Tax from "./pages/Tax";
import Assets from "./pages/Assets";
import Treasury from "./pages/Treasury";
import Settings from "./pages/Settings";

// Application avec comptes : /login et /signup sont publiques, tout le reste
// est protégé par <Protected> et rendu dans le Shell (navigation latérale).
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Protected>
      <Shell>{children}</Shell>
    </Protected>
  );
}

export default function App() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />

      <Route path="/">
        <AppShell>
          <Dashboard />
        </AppShell>
      </Route>
      <Route path="/dashboard">
        <AppShell>
          <Dashboard />
        </AppShell>
      </Route>
      <Route path="/factures">
        <AppShell>
          <Invoices />
        </AppShell>
      </Route>
      <Route path="/factures/nouvelle">
        <AppShell>
          <NewInvoice />
        </AppShell>
      </Route>
      <Route path="/factures/:id">
        <AppShell>
          <InvoiceDetail />
        </AppShell>
      </Route>
      <Route path="/achats">
        <AppShell>
          <Bills />
        </AppShell>
      </Route>
      <Route path="/tiers">
        <AppShell>
          <Partners />
        </AppShell>
      </Route>
      <Route path="/articles">
        <AppShell>
          <Products />
        </AppShell>
      </Route>
      <Route path="/paie">
        <AppShell>
          <Payroll />
        </AppShell>
      </Route>
      <Route path="/salaries">
        <AppShell>
          <Employees />
        </AppShell>
      </Route>
      <Route path="/comptabilite">
        <AppShell>
          <Accounting />
        </AppShell>
      </Route>
      <Route path="/fiscalite">
        <AppShell>
          <Tax />
        </AppShell>
      </Route>
      <Route path="/tva">
        <AppShell>
          <Vat />
        </AppShell>
      </Route>
      <Route path="/immobilisations">
        <AppShell>
          <Assets />
        </AppShell>
      </Route>
      <Route path="/tresorerie">
        <AppShell>
          <Treasury />
        </AppShell>
      </Route>
      <Route path="/parametres">
        <AppShell>
          <Settings />
        </AppShell>
      </Route>
      <Route>{() => <div className="p-8 text-[13px] text-muted-foreground">Page introuvable</div>}</Route>
    </Switch>
  );
}
