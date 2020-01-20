'use strict';

module.exports = {
	set: value => value ? 'setOn' : 'setOff',
	setParser: () => ({}),
	get: 'onOff',
	reportParser(value) {
		return value === 1;
	},
	report: 'onOff',
	getOpts: {
		getOnStart: true,
	},
};
