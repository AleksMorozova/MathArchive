import { clearStudentOutboxes } from "./attemptOutbox";
import { Alert, Button, Menu, MenuItem } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { studentApi } from "../../api/studentApi";
import { getApiErrorMessage } from "../../api/apiErrors";
import { studentSessionKey, useStudentSession } from "./useStudentSession";
export function StudentAccountControl() {
  const session = useStudentSession(); const cache = useQueryClient(); const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const logout = useMutation({ mutationFn: studentApi.logout, onSuccess: async () => {
    clearStudentOutboxes(); setAnchor(null);
    await cache.cancelQueries({ queryKey: studentSessionKey });
    await cache.cancelQueries({ queryKey: ["student"] });
    cache.removeQueries({ queryKey: ["student"] }); cache.setQueryData(studentSessionKey, null); navigate("/tests");
  } });
  if (!session.data) return <Button component={Link} to="/student/login" size="small" disabled={session.isPending}>Увійти для тестування</Button>;
  const s = session.data;
  return <><Button onClick={e => setAnchor(e.currentTarget)} aria-haspopup="menu" aria-expanded={!!anchor}>{s.firstName} {s.lastName.slice(0, 1)}. · {s.grade} клас</Button>
    <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
      <MenuItem component={Link} to="/student/profile" onClick={() => setAnchor(null)}>Мій профіль</MenuItem>
      <MenuItem component={Link} to="/student" onClick={() => setAnchor(null)}>Мої тести</MenuItem>
      <MenuItem component={Link} to="/student?tab=history" onClick={() => setAnchor(null)}>Історія проходжень</MenuItem>
      <MenuItem onClick={() => logout.mutate()} disabled={logout.isPending}>{logout.isPending ? "Виходимо…" : "Вийти"}</MenuItem>
      {logout.isError && <Alert severity="error">{getApiErrorMessage(logout.error)}</Alert>}
    </Menu></>;
}
