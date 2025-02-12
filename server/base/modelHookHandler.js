const httpStatus = require('http-status');
const APIError = require('../helpers/APIError');
const config = require('../../config/config');

// Carregado async para garantir que todas as models carregaram
let managerService;

function modelHookHandler(schema) {
  const props = Object.keys(schema.paths);

  // busca propriedades pra fazer o attach do populate
  let propsToPopulate = [];
  props.forEach((propName) => {
    const prop = schema.paths[propName];

    // if(propName == 'ownerId'){
    //   debugger;
    // }

    if (!prop) {
      return;
    }

    if (prop.instance === 'Array' &&
      prop.options &&
      prop.options.type &&
      prop.options.type.length
    ) {
      const childOptions = prop.options.type[0] || {};
      prop.options.populate = childOptions.populate;
      prop.options.populateData = childOptions.populateData;
    }

    if(prop.options && prop.options.populate) {
      propsToPopulate.push(prop.options.populateData ? prop.options.populateData : propName);
    }
  });

  if(propsToPopulate.length) {
    // https://mongoosejs.com/docs/populate.html#populate-middleware
    schema.pre(/^find/, function() {

      propsToPopulate.forEach(p => {
        this.populate(p);
      });
    });
  }

  const basePropName = {
    active: 'isActive'
  };

  schema.pre('save', function save(next) {
    next();
  });

  schema.pre('update', function update(next) {
    const self = this;
    let entity = self.getUpdate().$set;

    // console.log('user props=======', props, entity);

    if (!!~props.indexOf(basePropName.active) &&
      !entity.hasOwnProperty(basePropName.active)
    ) {
      self.update({}, {
        $set: {
          [basePropName.active]: false
        }
      });
    }

    next();
  });

  const publicMethods = {
    withStaticMethods,
    withManagerIntegration
  };

  function withStaticMethods() {

    schema.statics.get = function get(id) {
      return this.findById(id)
        .exec()
        .then((el) => {
          if (el) {
            return el;
          }
          const err = new APIError('Element does not exist', httpStatus.NOT_FOUND);
          return Promise.reject(err);
        });
    };

    schema.statics.list = function list({
      skip = 0,
      limit = 50
    } = {}) {
      return this.find()
        .sort({
          createdAt: -1
        })
        .skip(+skip)
        .limit(+limit)
        .exec();
    };

    schema.statics.listActives = function listActives({
      skip = 0,
      limit = 50
    } = {}) {
      return this.find({isActive: true})
        .sort({
          createdAt: -1
        })
        .skip(+skip)
        .limit(+limit)
        .exec();
    };

    return publicMethods;
  }

  function withManagerIntegration(ownerResover) {

    ownerResover = ownerResover || (d => d._id);

    if (!config.manager.enabled) {
      return;
    }

    const sendData = async model => {
      if(!managerService) {
        managerService = require('../helpers/managerService');
      }

      managerService.sendData(ownerResover(model))
    };

    schema.post('save', function onManagerIntegrationSave(doc, next) {
      // console.log('this', this, doc);
      sendData(doc);
      next();
    });

    schema.post('update', function onManagerIntegrationUpdate(doc, next) {
      this.findOne(this.getQuery())
          .then((d) => {
            sendData(d);
            next();
          });
    });

    return publicMethods;
  }

  return publicMethods;
}

module.exports = modelHookHandler;
