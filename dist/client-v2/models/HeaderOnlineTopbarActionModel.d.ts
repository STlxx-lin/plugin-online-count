import { TopbarActionModel } from '@nocobase/client-v2';
import React from 'react';
export declare class HeaderOnlineTopbarActionModel extends TopbarActionModel {
    sort: number;
    actionId: string;
    testId: string;
    icon: React.JSX.Element;
    tooltip: string;
    render(): React.JSX.Element;
}
export default HeaderOnlineTopbarActionModel;
