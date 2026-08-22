import { useMutation } from "@tanstack/react-query";
import { login } from "@/api/auth";

export function useLogin() {
  return useMutation({
      mutationFn: ({
        email,
        password,
        rememberMe = false,
      }: {
        email: string;
        password: string;
        rememberMe?: boolean;
      }) => login(email, password, rememberMe),
  });
}
