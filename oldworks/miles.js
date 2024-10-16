const GeotabApi = require('mg-api-js');
const fetch = require('node-fetch');

const mondayAccessToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjkwMzEwODA1LCJhYWkiOjExLCJ1aWQiOjE2Nzk1MTA1LCJpYWQiOiIyMDIwLTExLTA5VDAxOjAxOjI2LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo1MjQ3MzA0LCJyZ24iOiJ1c2UxIn0.ENNmUZ3yt1XYgeWAjRTBKjdZzb_IFio4VSROMZBoVf0';

const api = new GeotabApi({
    credentials: {
        database: 'zmrcorp1',
        userName: 'bentsionweiss@yahoo.com',
        password: 'Fedex123'
    },
    path: 'my.geotab.com'
});

async function fetchMondayGroups() {
    console.log("Fetching Monday.com groups...");
    const query = `query {
        boards(ids: 654431444) {
            groups {
                title
                id
            }
        }
    }`;

    const request = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': mondayAccessToken,
        },
        body: JSON.stringify({ query })
    };

    const response = await fetch("https://api.monday.com/v2", request);

    const responseData = await response.json();
    console.log("Response from Monday.com API:", responseData);

    const { data } = responseData;
    if (data && data.boards && Array.isArray(data.boards) && data.boards.length > 0) {
        return data.boards[0].groups;
    } else {
        console.error("Error: Unable to fetch Monday.com groups. Response:", responseData);
        return [];
    }
}

async function fetchDevicesAndUpdateOdometer(namesToFind) {
    try {
        const results = [];
        const group = {
            id: "GroupAssetInformationId"
        };
        const devices = await api.call('Get', {
            typeName: 'Device',
            search: {
                groups: [group]
            },
            resultsLimit: 200
        });
        const now = new Date().toISOString();
        const calls = [];
        const diagnostic = {
            id: "DiagnosticOdometerAdjustmentId"
        };

        devices.forEach(function (device) {
            const parts = device.name.split(/\s*-\s*/);
            const deviceIdentifier = parts[0];

            if (namesToFind.includes(deviceIdentifier)) {
                results.push({
                    name: device.name,
                    vehicleIdentificationNumber: device.vehicleIdentificationNumber
                });
                calls.push({
                    method: "Get",
                    params: {
                        typeName: "StatusData",
                        search: {
                            fromDate: now,
                            toDate: now,
                            diagnosticSearch: diagnostic,
                            deviceSearch: { id: device.id }
                        }
                    }
                });
            }
        });

        const callResults = await api.call("ExecuteMultiCall", {
            calls: calls
        });

        callResults.forEach((callResult, i) => {
            const statusData = callResult[0];
            if (statusData) {
                const kilometers = statusData.data;
                const miles = (kilometers * 0.621371).toFixed(6).slice(0, 6);
                results[i].odometer = miles;
            }
        });

        return results.filter(result => result.odometer !== undefined);
    } catch (error) {
        throw error;
    }
}

async function updateMondayOdometerReadings() {
    try {
        const groups = await fetchMondayGroups();
        console.log(`Fetched ${groups.length} groups from Monday.com.`);

        const namesAndItemIds = {
            "155537": "1300352351",
            "155796": "1300342845",
            "155797": "1300341186",
            "162246": "1300345210",
            "162247": "1300349450",
            "162248": "1300348007",
            "164003": "1300356754",
            "164004": "1300357909",
            "164013": "1300354107",
            "164014": "1388749808",
            "292470": "4155597387",
            "292471": "3335426976",
            "292472": "4155600952",
            "292498": "2999228918"
        };

        const devicesWithOdometer = await fetchDevicesAndUpdateOdometer(Object.keys(namesAndItemIds));

        for (const [name, item_id] of Object.entries(namesAndItemIds)) {
            const device = devicesWithOdometer.find(device => device.name.startsWith(name));
            if (device) {
                console.log(`Updating Monday.com for device ${name} with item ID: ${item_id}...`);
                const mutationQuery = `
                    mutation {
                        change_column_value (
                            board_id: 654431444,
                            item_id: "${item_id}",
                            column_id: "miles12",
                            value: "{\\"text\\":\\"${device.odometer}\\"}"
                        ) {
                            id
                        }
                    }
                `;
                console.log("Mutation query:", mutationQuery);
                const response = await fetch("https://api.monday.com/v2", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': mondayAccessToken,
                    },
                    body: JSON.stringify({ query: mutationQuery })
                });
                const data = await response.json();
                console.log("Monday.com update response:", data);
            } else {
                console.log(`No matching device found for ${name}.`);
            }
        }
    } catch (error) {
        console.error('Error updating Monday.com:', error);
    }
}

updateMondayOdometerReadings();
