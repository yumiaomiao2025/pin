import { widgetToColors, colorsEqual, settingsToColors, colorsToSettings, colorsToWidgetPatch, kitToColors } from './color-model';
import { COLOR_PRESETS, normalizeKitColors } from '../../shared/colors';
import type { IpcMainInvokeEvent } from 'electron';

import type { AppDatabaseService } from '../database/app-service';
import type { UpdateSettingsInput } from '../database/repositories';
import type { Widget, Settings } from '../database/schema';
import type { WindowManager } from '../window-manager';
import { colorsScopeForEvent } from '../windows/identities';

type ColorDependencies = {
  isUtilityEvent(event: IpcMainInvokeEvent): boolean;
  updateGlobalSettings(patch: UpdateSettingsInput): Settings;
  broadcastWidget(widget: Widget): void;
};

type ColorActions = Pick<WindowManager,
  | 'getColorContext' | 'applyDefaultPreset' | 'applyWidgetPreset' | 'setWidgetFollowDefault'
  | 'listColorKits' | 'createColorKit' | 'updateColorKit' | 'renameColorKit'
  | 'deleteColorKit' | 'applyColorKit'
>;

export function createColorActions(service: AppDatabaseService, dependencies: ColorDependencies): ColorActions {
  const { isUtilityEvent, updateGlobalSettings, broadcastWidget } = dependencies;
  return {
    getColorContext: (event) => {
      const context = colorsScopeForEvent(event);
      if (!context || (context.scope !== 'default' && context.scope !== 'widget')) {
        return undefined;
      }
      if (context.scope === 'widget') {
        if (!context.widgetId) {
          return undefined;
        }
        const widget = service.widgets.getById(context.widgetId);
        if (!widget) {
          return undefined;
        }
        const colors = widgetToColors(widget);
        const activeKitId = service.customKits.getById(widget.colorKitId ?? '')?.id ?? null;
        const activePresetId = activeKitId ? null : COLOR_PRESETS.find((preset) => colorsEqual(preset, colors))?.id ?? null;
        return {
          scope: 'widget' as const,
          colors,
          activePresetId,
          activeKitId,
          appliedWindowCount: 1,
          followsDefault: widget.followsDefault,
          widgetTitle: widget.title.trim() || widget.type.toUpperCase(),
        };
      }
      const settings = service.settings.ensure();
      const colors = settingsToColors(settings);
      const activeKitId = service.customKits.getById(settings.defaultColorKitId ?? '')?.id ?? null;
      const activePresetId = activeKitId ? null : COLOR_PRESETS.find((preset) => colorsEqual(preset, colors))?.id ?? null;
      const appliedWindowCount = service.widgets.list().filter((widget) => widget.followsDefault).length;
      return { scope: 'default' as const, colors, activePresetId, activeKitId, appliedWindowCount };
    },

    applyDefaultPreset: (event, presetId) => {
      if (colorsScopeForEvent(event)?.scope !== 'default') {
        return undefined;
      }
      const preset = COLOR_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) {
        return undefined;
      }
      return updateGlobalSettings({ ...colorsToSettings(preset), defaultColorKitId: null });
    },

    applyWidgetPreset: (event, presetId) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'widget' || !context.widgetId) {
        return undefined;
      }
      const preset = COLOR_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) {
        return undefined;
      }
      const updated = service.widgets.update(context.widgetId, {
        ...colorsToWidgetPatch(preset),
        colorKitId: null,
        followsDefault: false,
      });
      if (updated) {
        broadcastWidget(updated);
      }
      return updated;
    },

    setWidgetFollowDefault: (event, followsDefault) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'widget' || !context.widgetId) {
        return undefined;
      }
      const patch = followsDefault
        ? { ...colorsToWidgetPatch(settingsToColors(service.settings.ensure())), colorKitId: service.settings.ensure().defaultColorKitId, followsDefault: true }
        : { followsDefault: false };
      const updated = service.widgets.update(context.widgetId, patch);
      if (updated) {
        broadcastWidget(updated);
      }
      return updated;
    },

    listColorKits: (event) => {
      return isUtilityEvent(event) ? service.customKits.list() : undefined;
    },

    createColorKit: (event, name, colors) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'default' && context?.scope !== 'widget') {
        return undefined;
      }
      const normalizedName = name.trim();
      if (!normalizedName) {
        return undefined;
      }
      if (context.scope === 'widget' && !service.widgets.getById(context.widgetId ?? '')) {
        return undefined;
      }
      return service.customKits.create({
        name: normalizedName,
        ...normalizeKitColors(colors),
      });
    },

    updateColorKit: (event, kitId, name, colors) => {
      const context = colorsScopeForEvent(event);
      if ((context?.scope !== 'default' && context?.scope !== 'widget') || !name.trim()) {
        return undefined;
      }
      const kit = service.customKits.update(kitId, { name: name.trim(), ...normalizeKitColors(colors) });
      if (!kit) return undefined;
      if (service.settings.ensure().defaultColorKitId === kitId) {
        updateGlobalSettings(colorsToSettings(kitToColors(kit)));
      }
      service.widgets.list().filter((widget) => widget.colorKitId === kitId).forEach((widget) => {
        const updated = service.widgets.update(widget.id, colorsToWidgetPatch(kitToColors(kit)));
        if (updated) broadcastWidget(updated);
      });
      return kit;
    },

    renameColorKit: (event, kitId, name) => {
      const context = colorsScopeForEvent(event);
      if ((context?.scope !== 'default' && context?.scope !== 'widget') || !name.trim()) {
        return undefined;
      }
      return service.customKits.update(kitId, { name: name.trim() });
    },

    deleteColorKit: (event, kitId) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'default' && context?.scope !== 'widget') {
        return undefined;
      }
      const kit = service.customKits.getById(kitId);
      if (!kit || !service.customKits.delete(kitId)) {
        return undefined;
      }
      if (service.settings.ensure().defaultColorKitId === kitId) {
        updateGlobalSettings({ defaultColorKitId: null });
      }
      service.widgets.list().filter((widget) => widget.colorKitId === kitId).forEach((widget) => {
        const updated = service.widgets.update(widget.id, { colorKitId: null });
        if (updated) broadcastWidget(updated);
      });
      return kit;
    },

    applyColorKit: (event, kitId) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'default' && context?.scope !== 'widget') {
        return undefined;
      }
      const kit = service.customKits.getById(kitId);
      if (!kit) {
        return undefined;
      }
      const colors = kitToColors(kit);
      if (context.scope === 'default') {
        return updateGlobalSettings({ ...colorsToSettings(colors), defaultColorKitId: kitId });
      }
      if (!context.widgetId) {
        return undefined;
      }
      const updated = service.widgets.update(context.widgetId, {
        ...colorsToWidgetPatch(colors),
        colorKitId: kitId,
        followsDefault: false,
      });
      if (updated) {
        broadcastWidget(updated);
      }
      return updated;
    },
  };
}
