import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/solarService";
import * as archiveApi from "@/services/archiveHistoryService";
import type { EnergyRange } from "@/types/solar";

const LIVE_REFRESH_INTERVAL_MS = 60_000;
const WEATHER_REFRESH_INTERVAL_MS = 15 * 60_000;

export const useLivePower = () =>
  useQuery({
    queryKey: ["live-power"],
    queryFn: api.fetchLivePower,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });

export const useEnergyTotals = () =>
  useQuery({
    queryKey: ["energy-totals"],
    queryFn: api.fetchEnergyTotals,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });

export const usePlantInfo = () => useQuery({ queryKey: ["plant"], queryFn: api.fetchPlantInfo });

export const useInverter = () =>
  useQuery({
    queryKey: ["inverter"],
    queryFn: api.fetchInverter,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });

export const useLogger = () =>
  useQuery({
    queryKey: ["logger"],
    queryFn: api.fetchLogger,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });

export const useEnergySeries = (range: EnergyRange, selectedDate: Date) =>
  useQuery({
    queryKey: ["energy-series", range, selectedDate.toISOString().slice(0, 10)],
    queryFn: () => api.fetchEnergySeries(range, selectedDate),
  });

export const useAnalyticsData = (year: number) =>
  useQuery({ queryKey: ["analytics", year], queryFn: () => api.fetchAnalyticsData(year) });

export const useDailyHistory = (selectedDate: Date) =>
  useQuery({
    queryKey: ["history-daily", selectedDate.getFullYear(), selectedDate.getMonth()],
    queryFn: () => api.fetchDailyHistory(selectedDate),
  });

export const useMonthlyHistory = (year: number) =>
  useQuery({ queryKey: ["history-monthly", year], queryFn: () => api.fetchMonthlyHistory(year) });

export const useYearlyHistory = () =>
  useQuery({ queryKey: ["history-yearly"], queryFn: api.fetchYearlyHistory });

// EnergyScope Archive source - enabled only while the History page shows it,
// so archive requests never fire in UTL Live mode.
export const useArchiveDailyHistory = (selectedDate: Date, enabled: boolean) =>
  useQuery({
    queryKey: ["archive-history-daily", selectedDate.getFullYear(), selectedDate.getMonth()],
    queryFn: () =>
      archiveApi.fetchArchiveMonthDays(selectedDate.getFullYear(), selectedDate.getMonth()),
    enabled,
  });

export const useArchiveMonthlyHistory = (year: number, enabled: boolean) =>
  useQuery({
    queryKey: ["archive-history-monthly", year],
    queryFn: () => archiveApi.fetchArchiveYearMonths(year),
    enabled,
  });

export const useArchiveYearlyHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ["archive-history-yearly"],
    queryFn: archiveApi.fetchArchiveYears,
    enabled,
  });

export const useArchiveTotalHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ["archive-history-total"],
    queryFn: archiveApi.fetchArchiveTotal,
    enabled,
  });

export const useWeather = (latitude: number | undefined, longitude: number | undefined) =>
  useQuery({
    queryKey: ["weather", latitude, longitude],
    queryFn: () => api.fetchWeather(latitude!, longitude!),
    enabled: Number.isFinite(latitude) && Number.isFinite(longitude),
    staleTime: WEATHER_REFRESH_INTERVAL_MS,
    refetchInterval: WEATHER_REFRESH_INTERVAL_MS,
    retry: false,
  });

export const useWeatherNow = () => {
  const { data: plant } = usePlantInfo();
  const weather = useWeather(plant?.latitude, plant?.longitude);

  return {
    ...weather,
    data: weather.data?.current ?? null,
  };
};

export const useMaintenance = () =>
  useQuery({ queryKey: ["maintenance"], queryFn: api.fetchMaintenance });

export const useUpdateMaintenance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.updateMaintenance,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["maintenance"],
      });
    },
  });
};

export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: api.fetchNotifications });
export const usePrediction = () =>
  useQuery({
    queryKey: ["prediction"],
    queryFn: api.fetchPrediction,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });
