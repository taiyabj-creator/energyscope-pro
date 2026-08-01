import { useMutation } from "@tanstack/react-query";
import { login } from "@/api/auth";

export function useLogin() {
  return useMutation({
    mutationFn: ({
      email,
      password,
      deviceId,
    }: {
      email: string;
      password: string;
      deviceId: string;
    }) =>
      login(email, password, deviceId),
  });
}