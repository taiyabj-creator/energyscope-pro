import { useMutation } from "@tanstack/react-query";
import { login } from "@/api/auth";

export function useLogin() {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
  });
}
