// src/dataMapper.ts

import fs from 'fs';
import path from 'path';

import { BCP008Mapping, MappingField, MonitorType, Notification } from './datatypes';

const mappingFile = path.resolve(process.cwd(), 'src/config/bcp008-mapping.json');
const mapping: BCP008Mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));

export interface ObjectInfo {
    monitorType: MonitorType;
    tags: Record<string, string>;
    fields: Record<string, string>;
}

export function mapNotificationToLine(notification: Notification, objectInfo: ObjectInfo): string | null {
    const config = mapping[objectInfo.monitorType];

    const field = config.fields.find((f: MappingField) =>
        f.propertyId.level === notification.eventData.propertyId.level &&
        f.propertyId.index === notification.eventData.propertyId.index
    );

    if (!field) {
        return null;
    }

    const tagString = Object.entries(objectInfo.tags)
        .map(([key, value]) => `${escapeText(key)}=${escapeText(value)}`)
        .join(',');

    const rawValue = notification.eventData.value ?? '';

    const fieldValue = formatFieldValue(field.type, rawValue);

    const fields: string[] = [`${field.name}=${fieldValue}`];
    fields.push(`oid=${notification.oid}i`);
    fields.push(`event_id_level=${notification.eventId.level}i`);
    fields.push(`event_id_index=${notification.eventId.index}i`);
    fields.push(`property_id_level=${notification.eventData.propertyId.level}i`);
    fields.push(`property_id_index=${notification.eventData.propertyId.index}i`);
    fields.push(`change_type=${notification.eventData.changeType}i`);
    if (notification.eventData.sequenceItemIndex !== null) {
        fields.push(`sequence_item_index=${notification.eventData.sequenceItemIndex}i`);
    }
    if (field.enum) {
        const enumText = field.enum[String(rawValue)];
        const enumValue = formatFieldValue('string', enumText);
        fields.push(`${escapeText(`${field.name}_text`)}=${enumValue}`);
    }

    for (const [key, value] of Object.entries(objectInfo.fields)) {
        const formatted = formatFieldValue('string', value);
        fields.push(`${escapeText(key)}=${formatted}`);
    }

    const timestamp = `${Date.now()}000000`;

    // Put together string and return it
    return `${config.table},${tagString} ${fields.join(',')} ${timestamp}`;
}

function formatFieldValue(type: MappingField['type'], value: unknown): string {
    if (type === 'integer') {
    return `${Number(value)}i`;
    }

    if (type === 'boolean') return value ? 't' : 'f';

    const text = String(value);
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function escapeText(value: unknown): string {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/([,= ])/g, '\\$1');
}
