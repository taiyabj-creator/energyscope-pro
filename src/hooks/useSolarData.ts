import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/solarService";
import type { EnergyRange } from "@/types/solar";

export const useLivePower = () =>
  useQuery({
    queryKey: ["live-power"],
    queryFn: api.fetchLivePower,
    refetchInterval: 5000,
  });

export const useBattery = () => useQuery({ queryKey: ["battery"], queryFn: api.fetchBattery });

export const useEnergyTotals = () =>
  useQuery({ queryKey: ["energy-totals"], queryFn: api.fetchEnergyTotals });

export const usePlantInfo = () => useQuery({ queryKey: ["plant"], queryFn: api.fetchPlantInfo });

export const useInverter = () => useQuery({ queryKey: ["inverter"], queryFn: api.fetchInverter });

export const useLogger = () => useQuery({ queryKey: ["logger"], queryFn: api.fetchLogger });

export const useEnergySeries = (range: EnergyRange) =>
  useQuery({ queryKey: ["energy-series", range], queryFn: () => api.fetchEnergySeries(range) });

export const useAnalyticsSummary = () =>
  useQuery({ queryKey: ["analytics-summary"], queryFn: api.fetchAnalyticsSummary });

export const useHeatmap = () => useQuery({ queryKey: ["heatmap"], queryFn: api.fetchHeatmap });

export const useDailyHistory = () =>
  useQuery({ queryKey: ["history-daily"], queryFn: api.fetchDailyHistory });

export const useMonthlyHistory = () =>
  useQuery({ queryKey: ["history-monthly"], queryFn: api.fetchMonthlyHistory });

export const useYearlyHistory = () =>
  useQuery({ queryKey: ["history-yearly"], queryFn: api.fetchYearlyHistory });

export const useWeatherNow = () =>
  useQuery({ queryKey: ["weather-now"], queryFn: api.fetchWeatherNow });

export const useWeatherForecast = () =>
  useQuery({ queryKey: ["weather-forecast"], queryFn: api.fetchWeatherForecast });

export const useMaintenance = () =>
  useQuery({ queryKey: ["maintenance"], queryFn: api.fetchMaintenance });

export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: api.fetchNotifications });
