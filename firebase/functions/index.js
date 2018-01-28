'use strict';

const SHA256 = require('crypto-js/sha256');
const BASE64 = require('crypto-js/enc-base64');
const randomToken = require('random-token');
const axios = require('axios');
const moment = require('moment');

const SECRET_KEY = 'SkDUFKZaF0hjun4tEr3w84RRmHDqIf2sea9Mz2T6vxw';
const thirdPartyAccessId = 'CA1TAfCxtw6MprXw';
const apiRegistrationId = 'CA1ARNWA6QqVE4WF';

const APIv1 = 'https://gateway-web.beta.interac.ca/publicapi/api/v1';
const APIv2 = 'https://gateway-web.beta.interac.ca/publicapi/api/v2';

const InteracRequest = () => {
    class InteracRequest extends Promise {
      constructor(options) {
        if (options instanceof Function) {
          super(options);
          return this;
        }
        super((resolve, reject) => {
          const salt = randomToken(16);
          axios
            .create({
              headers: {
                secretKey: BASE64.stringify(SHA256(`${salt}:${SECRET_KEY}`)),
                salt,
                thirdPartyAccessId,
              }
            })
            .get(`${APIv1}/access-tokens`)
              .then(res => resolve(res.data))
              .catch(err => reject(err.response.data));
        });
        this.options = options;
        this.deviceId = `device${randomToken(8)}`;
        this.requestId = `request${randomToken(8)}`;
      }
    
      /**
       * get contacts by query
       * @param {String} match name of the user to be matched
       */
      getContacts(match = '') {
        return this.then(accessToken => {
          var promise = new Promise((resolve, reject) => {
            axios
              .create({
                headers: {
                  accessToken: `Bearer ${accessToken.access_token}`,
                  thirdPartyAccessId,
                  apiRegistrationId,
                  requestId: this.requestId,
                  deviceId: this.deviceId,
                }
              })
              .get(`${APIv2}/contacts`)
              .then(res => resolve(res.data))
              .catch(err => reject(err.response.data));
          });
          return promise;
        });
      }
    
      createContact(contactName, handle, handleType) {
        return this.then(accessToken => {
          var promise = new Promise((resolve, reject) => {
            axios
              .create({
                headers: {
                  accessToken: `Bearer ${accessToken.access_token}`,
                  thirdPartyAccessId,
                  apiRegistrationId,
                  requestId: this.requestId,
                  deviceId: this.deviceId,
                }
              })
              .post(`${APIv2}/contacts`, {
                contactName,
                language: 'en',
                notificationPreferences: [{
                  handle,
                  handleType,
                  active: true,
                }]
              })
              .then(res => resolve(res.data))
              .catch(err => reject(err.response.data));
          });
          return promise;
        });
      }
    
      /**
       * send money request to a contact
       * @param {Object} contact contact object returned by getContacts
       * @param {Number} amount amount of money to request
       * @param {String} currency currency to request
       * @param {String} requesterMessage message with the request
       */
      sendMoneyRequest(contact, amount, currency, requesterMessage) {
        const sourceMoneyRequestId = `source${randomToken(8)}`;
        console.log(contact);
        return this.then(accessToken => {
          var promise = new Promise((resolve, reject) => {
            axios
              .create({
                headers: {
                  accessToken: `Bearer ${accessToken.access_token}`,
                  thirdPartyAccessId,
                  apiRegistrationId,
                  requestId: this.requestId,
                  deviceId: this.deviceId,
                }
              })
              .post(`${APIv2}/money-requests/send`, {
                sourceMoneyRequestId,
                requestedFrom: contact,
                amount,
                currency,
                requesterMessage,
                editableFulfillAmount: false,
                expiryDate: moment().add(30, 'days').format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]'),
                supressResponderNotifications: false,
              })
              .then(res => resolve(res.data))
              .catch(err => reject(err.response.data));
          });
          return promise;
        });
      }
    }
    
    return new InteracRequest();
}
var GivenName = null;
var Email = null;
var PhoneNumber = null;
var number_of_request = 0;
const actionMap = new Map();
const CHECK_CONTACT = 'checkcontact';
const ADD_CONTACT = 'addContact';
actionMap.set('checkContact', app => {
    number_of_request = number_of_request + 1;
    if (number_of_request >= 6)
    {
        number_of_request = 0;
        return app.ask('Sorry, too many requests. I cannot afford that!')

    }
    if (app.getArgument('number') > 1000000)
        return app.ask(`Don't be silly! Nobody would send you such much money!`)
    if (app.getArgument('number') > 100000)
        return app.ask('Trust me, you will never need this huge amount of money except the case that you have to pay your tuition fee for the University of Toronto!')
    if (app.getArgument('number') > 1000)
        return app.ask('Sorry, the transfer limit is $1000 every time.')
    
    InteracRequest().getContacts().then(contactList => {
        for (var i = 0; i < contactList.length; ++i) {
            if (contactList[i].contactName.toLowerCase().indexOf(app.getArgument('given-name').toLowerCase()) >= 0) {
                return InteracRequest()
                    .sendMoneyRequest(
                        contactList[i],
                        app.getArgument('number'),
                        // app.getArgument('currency-name'),
                        'CAD',
                        'Give me my money')
                    .catch(err => app.ask(`${err.message}`))
                    .then(() => { return app.ask(`A request of ${app.getArgument('number')} dollars has been sent to ${app.getArgument('given-name')}`) })
                    
            }
        }
        app.setContext(CHECK_CONTACT, 10, {
            'check-given-name': app.getArgument('given-name'),
            'check-number': app.getArgument('number'),
            'email': app.getArgument('email'),
        });
        return app.ask(`Could you please provide me the phone number or email address of ${app.getArgument('given-name')}`);
    });
})


actionMap.set('addcontact', app => {
    console.log(app);
    let context = app.getContext(CHECK_CONTACT);
    
    if (context) {
        let givenName = context.parameters['check-given-name'];
        let number = context.parameters['check-number'];
        
        if (app.getArgument('given-name') !== null && givenName !== app.getArgument('given-name')) {
            return app.ask(`Could you tell me the phone number or email address of ${app.getArgument('given-name')}`)
        }
        
        if (app.getArgument('email') !== null) {
            InteracRequest().createContact(givenName, app.getArgument('email'), 'email')
                .then(res => InteracRequest().sendMoneyRequest(res, number, 'CAD', 'Give me my money')
                    .then(res => app.ask(`<speak>A request of ${number} dollars has be sent to ${givenName} through <say-as interpret-as="characters">${app.getArgument('email')}</say-as></speak>`)))
                .catch(err => app.ask(`${err.message}`));
        } else {
            InteracRequest().createContact(givenName, app.getArgument('phone-number'), 'sms')
                .then(res => InteracRequest().sendMoneyRequest(res, number, 'CAD', 'Give me my money')
                    .then(res => app.ask(`<speak>A request of ${number} dollars has be sent to ${givenName} through <say-as interpret-as="characters">${app.getArgument('phone-number')}</say-as></speak>`)))
                .catch(err => app.ask(`${err.message}`));
        }
        app.setContext(CHECK_CONTACT, 10, {
            'check-given-name': null,
            'check-number': null,
            'email': null,
        });
    } else {
        if (app.getArgument('given-name') !== null) GivenName = app.getArgument('given-name');
        if (app.getArgument('email') !== null) Email = app.getArgument('email');
        if (app.getArgument('phone-number') !== null) PhoneNumber = app.getArgument('phone-number');
        //app.ask(`${GivenName} and ${Email} and ${PhoneNumber}`);
        if (GivenName === null) return app.ask('Please provide the owner of the information');
        if ((Email === null) && (PhoneNumber === null)) return app.ask('Could you provide the email address or phone number');
        
        let tname = GivenName;
        let tnumber = PhoneNumber;
        let temail = Email;
        GivenName = null;
        PhoneNumber = null;
        Email = null;
        if (temail !== null) {
            InteracRequest().createContact(tname, temail, 'email')
                .then(res => app.ask(`<speak>Added email <say-as interpret-as="characters">${temail}</say-as> to ${tname}</speak>`))
                .catch(err => app.ask(`${err.message}`));
            return;
        } else {
            InteracRequest().createContact(tname, tnumber, 'sms')
                .then(res => app.ask(`<speak>Added phone number <say-as interpret-as="characters">${tnumber}</say-as> to ${tname}</speak>`))
                .catch(err => app.ask(`${err.message}`));
            return;
        }
    }
})

const functions = require('firebase-functions'); // Cloud Functions for Firebase library
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
    const app = new DialogflowApp({request, response});
    app.handleRequest(actionMap);
});